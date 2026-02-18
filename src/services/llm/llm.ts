import { LLMProviderId } from "../../config/loadConfig.js";
import type { HadrixConfig, LLMProvider } from "../../config/loadConfig.js";
import {
  LlmMissingApiKeyError,
  LlmResponseIncompleteError,
  ProviderApiResponseError,
  ProviderRequestFailedError
} from "../../errors/provider.errors.js";
import { runAnthropicAdapter } from "./anthropicClient.js";
import { runCodexAdapter } from "./codexClient.js";
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
const RETRY_MAX_TOKENS_FLOOR = 8192;
const RETRY_MAX_TOKENS_CAP = 65536;
const REASONING_MIN_MAX_TOKENS = 24576;
const REASONING_OUTPUT_RETRIES = 2;
const FALLBACK_OUTPUT_RETRIES = 1;
const TRANSIENT_RETRY_MAX_ATTEMPTS = 3;
const TRANSIENT_RETRY_BASE_DELAY_MS = 500;
const TRANSIENT_RETRY_MAX_DELAY_MS = 8000;
const CODEX_API_KEY_PLACEHOLDER = "codex-cli";
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

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

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

const isRetryableStatus = (status: number): boolean =>
  status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;

const isNonRetryableMessage = (message: string): boolean => {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("invalid api key") ||
    lowered.includes("unauthorized") ||
    lowered.includes("forbidden") ||
    lowered.includes("insufficient_quota") ||
    lowered.includes("insufficient quota") ||
    lowered.includes("account") && lowered.includes("disabled")
  );
};

const isRetryableMessage = (message: string): boolean => {
  const lowered = message.toLowerCase();
  return (
    lowered.includes("rate limit") ||
    lowered.includes("too many requests") ||
    lowered.includes("overloaded") ||
    lowered.includes("temporarily unavailable") ||
    lowered.includes("timeout") ||
    lowered.includes("timed out") ||
    lowered.includes("socket hang up") ||
    lowered.includes("connection reset") ||
    lowered.includes("connection refused")
  );
};

const isRetryableIncomplete = (err: LlmResponseIncompleteError): boolean => {
  if (isRetryableOutputLimitError(err)) return false;
  const reason = (err.reason ?? "").toLowerCase();
  if (!reason) return true;
  return !(reason.includes("content") || reason.includes("safety") || reason.includes("policy"));
};

const shouldRetryTransient = (err: unknown): boolean => {
  if (err instanceof LlmResponseIncompleteError) {
    return isRetryableIncomplete(err);
  }
  const status = extractErrorStatus(err);
  if (status !== null) {
    return isRetryableStatus(status);
  }
  if (isLikelyNetworkError(err)) return true;
  const message = err instanceof Error ? err.message : String(err);
  if (isNonRetryableMessage(message)) return false;
  return isRetryableMessage(message);
};

const computeBackoffMs = (attempt: number): number => {
  const base = TRANSIENT_RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1));
  const extra = attempt >= 2 ? TRANSIENT_RETRY_BASE_DELAY_MS : 0;
  const jitter = Math.random() * TRANSIENT_RETRY_BASE_DELAY_MS;
  const delay = Math.min(TRANSIENT_RETRY_MAX_DELAY_MS, base + extra + jitter);
  return Math.max(0, Math.round(delay));
};

const resolveRetryMaxTokens = (current: number): number => {
  const bumped = current + 4096;
  const doubled = current * 2;
  const candidate = Math.max(bumped, doubled, RETRY_MAX_TOKENS_FLOOR);
  return Math.min(candidate, RETRY_MAX_TOKENS_CAP);
};

const isRetryableOutputLimitError = (err: unknown): err is LlmResponseIncompleteError => {
  if (!(err instanceof LlmResponseIncompleteError)) return false;
  if (err.reason === "max_output_tokens") return true;
  if (err.outputTokens !== undefined && err.maxOutputTokens !== undefined) {
    return err.outputTokens >= err.maxOutputTokens;
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
  if (err instanceof LlmResponseIncompleteError) {
    const message =
      err.reason === "max_output_tokens"
        ? "LLM response exceeded the output token limit. Increase max tokens or reduce prompt size."
        : "LLM response incomplete. Increase max tokens or retry the request.";
    throw new ProviderApiResponseError(message);
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

  if (provider !== LLMProviderId.Codex && !apiKey) {
    throw new LlmMissingApiKeyError();
  }
  const resolvedApiKey = apiKey ?? CODEX_API_KEY_PLACEHOLDER;

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
  const reasoningEnabled = config.llm.reasoning === true;
  const gpt5MinMaxTokens = isGpt5 ? 4096 : 0;
  const reasoningMinMaxTokens = reasoningEnabled && isGpt5 ? REASONING_MIN_MAX_TOKENS : 0;
  const baseMaxTokens = Math.max(config.llm.maxTokens, gpt5MinMaxTokens, reasoningMinMaxTokens);
  const fallbackMaxTokens = Math.max(config.llm.maxTokens, gpt5MinMaxTokens);
  const baseUrl = resolveSdkBaseUrl(config);
  const defaultHeaders = resolveAdapterHeaders(config);
  const rateLimitManager = resolveRateLimitManager(effectiveConfig, resolvedApiKey, baseUrl);
  const limiter = resolveConcurrencyLimiter(effectiveConfig, resolvedApiKey, baseUrl);
  const release = limiter ? await limiter.acquire() : null;

  const runAdapter = async (maxTokens: number, reasoning?: boolean): Promise<LlmAdapterResult> => {
    const estimatedTokens = estimateTokensFromMessages(messages, maxTokens);
    await rateLimitManager.beforeRequest(estimatedTokens);
    try {
      const adapterInput: LlmAdapterInput = {
        provider,
        model,
        messages,
        temperature: config.llm.temperature,
        maxTokens,
        reasoning
      };
      const result =
        provider === LLMProviderId.Codex
          ? await runCodexAdapter(adapterInput, { cwd: config.projectRoot })
          : provider === LLMProviderId.Anthropic
            ? await runAnthropicAdapter(adapterInput, {
                apiKey: resolvedApiKey,
                baseUrl,
                maxRetries: Math.max(0, MAX_ATTEMPTS - 1),
                defaultHeaders
              })
            : await runOpenAiAdapter(adapterInput, {
                apiKey: resolvedApiKey,
                baseUrl,
                maxRetries: Math.max(0, MAX_ATTEMPTS - 1),
                defaultHeaders
              });
      rateLimitManager.updateFromResponse(result.response);
      return result;
    } catch (err) {
      rateLimitManager.updateFromResponse(
        (err as { response?: Response }).response ?? (err as { rawResponse?: Response }).rawResponse
      );
      throw err;
    }
  };

  const runWithOutputRetry = async (
    maxTokens: number,
    reasoning: boolean | undefined,
    maxRetries: number
  ): Promise<LlmAdapterResult> => {
    let attempt = 0;
    let currentMaxTokens = maxTokens;
    while (true) {
      try {
        return await runAdapter(currentMaxTokens, reasoning);
      } catch (err) {
        if (!isRetryableOutputLimitError(err) || attempt >= maxRetries) {
          throw err;
        }
        attempt += 1;
        currentMaxTokens = resolveRetryMaxTokens(currentMaxTokens);
      }
    }
  };

  const runWithTransientRetry = async (
    run: () => Promise<LlmAdapterResult>
  ): Promise<LlmAdapterResult> => {
    let attempt = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        return await run();
      } catch (err) {
        if (!shouldRetryTransient(err) || attempt >= TRANSIENT_RETRY_MAX_ATTEMPTS) {
          throw err;
        }
        const delayMs = computeBackoffMs(attempt);
        attempt += 1;
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }
  };

  try {
    const result = await runWithTransientRetry(() =>
      runWithOutputRetry(
        baseMaxTokens,
        reasoningEnabled,
        reasoningEnabled ? REASONING_OUTPUT_RETRIES : FALLBACK_OUTPUT_RETRIES
      )
    );
    return result.text;
  } catch (err) {
    if (reasoningEnabled) {
      try {
        const retryResult = await runWithTransientRetry(() =>
          runWithOutputRetry(fallbackMaxTokens, false, FALLBACK_OUTPUT_RETRIES)
        );
        return retryResult.text;
      } catch (retryErr) {
        return throwAdapterError(retryErr, provider, baseUrl ?? config.llm.endpoint);
      }
    }
    return throwAdapterError(err, provider, baseUrl ?? config.llm.endpoint);
  } finally {
    release?.();
  }
}
