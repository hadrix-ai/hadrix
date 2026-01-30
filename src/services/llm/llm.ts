import { LLMProviderId } from "../../config/loadConfig.js";
import type { HadrixConfig, LLMProvider } from "../../config/loadConfig.js";
import {
  LlmMissingApiKeyError,
  ProviderApiResponseError,
  ProviderRequestFailedError
} from "../../errors/provider.errors.js";
import { runAnthropicAdapter } from "./anthropicClient.js";
import { runOpenAiAdapter } from "./openaiClient.js";
import { Semaphore } from "./rateLimitHelpers.js";
import { RateLimitManager } from "./rateLimitManager.js";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface LlmAdapterInput {
  provider: LLMProvider;
  model: string;
  messages: ChatMessage[];
  temperature: number;
  maxTokens: number;
  reasoning?: boolean;
}

export interface LlmAdapterUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

export interface LlmAdapterResult {
  text: string;
  usage?: LlmAdapterUsage;
  raw: unknown;
  response?: Response;
}

const MAX_ATTEMPTS = 3;
const concurrencyLimiters = new Map<string, Semaphore>();
const rateLimitManagers = new Map<string, RateLimitManager>();
const SDK_ENDPOINT_SUFFIX = /\/v1\/(chat\/completions|responses|messages)\/?$/;
const NETWORK_ERROR_CODES = new Set([
  "ECONNABORTED",
  "ECONNREFUSED",
  "ECONNRESET",
  "EAI_AGAIN",
  "ENETUNREACH",
  "ENOTFOUND",
  "ETIMEDOUT"
]);

const resolveConcurrencyLimiter = (
  config: HadrixConfig,
  apiKey: string,
  baseUrl?: string
): Semaphore | null => {
  const maxConcurrency = config.llm.maxConcurrency;
  if (!maxConcurrency || !Number.isFinite(maxConcurrency)) {
    return null;
  }
  const normalized = Math.max(1, Math.trunc(maxConcurrency));
  const keyBase = baseUrl ?? config.llm.endpoint ?? "";
  const key = `${config.llm.provider}|${keyBase}|${config.llm.model}|${apiKey}`;
  const existing = concurrencyLimiters.get(key);
  if (existing) {
    existing.setMax(normalized);
    return existing;
  }
  const limiter = new Semaphore(normalized);
  concurrencyLimiters.set(key, limiter);
  return limiter;
};

const resolveRateLimitManager = (
  config: HadrixConfig,
  apiKey: string,
  baseUrl?: string
): RateLimitManager => {
  const keyBase = baseUrl ?? config.llm.endpoint ?? "";
  const key = `${config.llm.provider}|${keyBase}|${config.llm.model}|${apiKey}`;
  const existing = rateLimitManagers.get(key);
  if (existing) return existing;
  const manager = new RateLimitManager(config.llm.provider);
  rateLimitManagers.set(key, manager);
  return manager;
};

const resolveSdkBaseUrl = (config: HadrixConfig): string | undefined => {
  const candidate = (config.llm.baseUrl || config.llm.endpoint || "").trim();
  if (!candidate) return undefined;
  const stripped = candidate.replace(SDK_ENDPOINT_SUFFIX, "").replace(/\/$/, "");
  if (!stripped) return undefined;
  if (config.llm.provider === LLMProviderId.OpenAI) {
    return stripped.endsWith("/v1") ? stripped : `${stripped}/v1`;
  }
  return stripped.replace(/\/v1$/, "");
};

const resolveAdapterHeaders = (config: HadrixConfig): Record<string, string> | undefined => {
  const headers = config.api.headers;
  const entries = Object.entries(headers);
  if (entries.length === 0) return undefined;
  const filtered: Record<string, string> = {};
  for (const [key, value] of entries) {
    const normalized = key.toLowerCase();
    if (normalized === "authorization") continue;
    if (normalized === "x-api-key") continue;
    if (normalized === "anthropic-version") continue;
    filtered[key] = value;
  }
  return Object.keys(filtered).length ? filtered : undefined;
};

const resolveReasoningModel = (config: HadrixConfig): string => {
  if (config.llm.reasoning !== true) {
    return config.llm.model;
  }
  const candidate = (config.llm.reasoningModel ?? "").trim();
  return candidate || config.llm.model;
};

const estimateTokensFromMessages = (messages: ChatMessage[], maxOutputTokens: number): number => {
  const charCount = messages.reduce((total, message) => total + message.content.length, 0);
  const estimatedInput = Math.ceil(charCount / 4);
  return Math.max(1, estimatedInput + Math.max(0, maxOutputTokens));
};

const extractErrorStatus = (err: unknown): number | null => {
  if (!err || typeof err !== "object") return null;
  const direct = (err as { status?: unknown }).status;
  if (typeof direct === "number" && Number.isFinite(direct)) return direct;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  if (typeof statusCode === "number" && Number.isFinite(statusCode)) return statusCode;
  const responseStatus = (err as { response?: { status?: unknown } }).response?.status;
  if (typeof responseStatus === "number" && Number.isFinite(responseStatus)) {
    return responseStatus;
  }
  return null;
};

const extractErrorCode = (err: unknown): string | null => {
  if (!err || typeof err !== "object") return null;
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === "string") return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && typeof cause === "object") {
    const causeCode = (cause as { code?: unknown }).code;
    if (typeof causeCode === "string") return causeCode;
  }
  return null;
};

const isLikelyNetworkError = (err: unknown): boolean => {
  const code = extractErrorCode(err);
  if (code && NETWORK_ERROR_CODES.has(code)) return true;
  if (err instanceof Error) {
    const combined = `${err.name} ${err.message}`.toLowerCase();
    if (combined.includes("timeout") || combined.includes("timed out")) return true;
    if (combined.includes("network") || combined.includes("fetch failed")) return true;
    if (combined.includes("socket") && combined.includes("hang up")) return true;
  }
  return false;
};

const throwAdapterError = (
  err: unknown,
  provider: LLMProvider,
  urlLabel: string
): never => {
  if (err instanceof ProviderApiResponseError || err instanceof ProviderRequestFailedError) {
    throw err;
  }
  const status = extractErrorStatus(err);
  const message = err instanceof Error ? err.message : String(err);
  if (status !== null) {
    const detail = message || `LLM request failed with status ${status}`;
    throw new ProviderApiResponseError(detail);
  }
  if (isLikelyNetworkError(err)) {
    throw new ProviderRequestFailedError("LLM", provider, urlLabel, message);
  }
  throw err;
};

export async function runChatCompletion(config: HadrixConfig, messages: ChatMessage[]): Promise<string> {
  const provider = config.llm.provider;
  const apiKey = config.llm.apiKey || config.api.apiKey;

  if (!apiKey) {
    throw new LlmMissingApiKeyError();
  }

  const model = resolveReasoningModel(config);
  const effectiveConfig =
    model === config.llm.model
      ? config
      : {
          ...config,
          llm: {
            ...config.llm,
            model
          }
        };
  const isGpt5 = provider === LLMProviderId.OpenAI && model.toLowerCase().startsWith("gpt-5");
  const maxTokens = isGpt5 ? Math.max(config.llm.maxTokens, 4096) : config.llm.maxTokens;
  const estimatedTokens = estimateTokensFromMessages(messages, maxTokens);
  const baseUrl = resolveSdkBaseUrl(config);
  const defaultHeaders = resolveAdapterHeaders(config);
  const rateLimitManager = resolveRateLimitManager(effectiveConfig, apiKey, baseUrl);
  await rateLimitManager.beforeRequest(estimatedTokens);
  const limiter = resolveConcurrencyLimiter(effectiveConfig, apiKey, baseUrl);
  const release = limiter ? await limiter.acquire() : null;
  const adapterInput: LlmAdapterInput = {
    provider,
    model,
    messages,
    temperature: config.llm.temperature,
    maxTokens,
    reasoning: config.llm.reasoning
  };

  try {
    const adapterOptions = {
      apiKey,
      baseUrl,
      maxRetries: Math.max(0, MAX_ATTEMPTS - 1),
      defaultHeaders
    };
    const result =
      provider === LLMProviderId.Anthropic
        ? await runAnthropicAdapter(adapterInput, adapterOptions)
        : await runOpenAiAdapter(adapterInput, adapterOptions);
    rateLimitManager.updateFromResponse(result.response);
    return result.text;
  } catch (err) {
    rateLimitManager.updateFromResponse(
      (err as { response?: Response }).response ?? (err as { rawResponse?: Response }).rawResponse
    );
    return throwAdapterError(err, provider, baseUrl ?? config.llm.endpoint);
  } finally {
    release?.();
  }
}
