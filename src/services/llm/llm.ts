import { setTimeout as delay } from "node:timers/promises";

import { LLMProviderId } from "../../config/loadConfig.js";
import type { HadrixConfig, LLMProvider } from "../../config/loadConfig.js";
import {
  LlmMissingApiKeyError,
  ProviderApiResponseError,
  ProviderRequestFailedError
} from "../../errors/provider.errors.js";
import { LlmRateLimiter } from "./llmRateLimiter.js";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: { message?: string };
}

interface ResponsesApiResponse {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: { message?: string };
}

interface AnthropicMessageResponse {
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  error?: { message?: string };
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;
const ANTHROPIC_VERSION = "2023-06-01";
const RATE_LIMIT_BASE_DELAY_MS = 10_000;
const RATE_LIMIT_MAX_DELAY_MS = 60_000;

const rateLimiter = new LlmRateLimiter();

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return timestamp - Date.now();
  return null;
}

function computeDelayMs(attempt: number, retryAfter: string | null, isRateLimit: boolean): number {
  const retryAfterMs = parseRetryAfterMs(retryAfter);
  if (retryAfterMs !== null) {
    return Math.max(0, retryAfterMs);
  }
  const base = isRateLimit ? RATE_LIMIT_BASE_DELAY_MS : BASE_DELAY_MS;
  const maxDelay = isRateLimit ? RATE_LIMIT_MAX_DELAY_MS : MAX_DELAY_MS;
  const backoff = Math.min(maxDelay, base * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * 100);
  return backoff + jitter;
}

function estimateTokensFromMessages(messages: ChatMessage[], maxOutputTokens: number): number {
  const inputChars = messages.reduce((sum, message) => sum + message.content.length, 0);
  const inputTokens = Math.max(1, Math.ceil(inputChars / 4));
  const outputTokens = Number.isFinite(maxOutputTokens) ? Math.max(0, Math.trunc(maxOutputTokens)) : 0;
  return inputTokens + outputTokens;
}

async function safeFetch(
  url: string,
  options: RequestInit,
  provider: LLMProvider,
  label: string,
  requestTokens: number
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const release = await rateLimiter.acquire(requestTokens);
    try {
      const response = await fetch(url, options);
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
        release();
        return response;
      }
      const isRateLimit = response.status === 429;
      const retryAfter = response.headers.get("retry-after");
      const delayMs = computeDelayMs(attempt, retryAfter, isRateLimit);
      if (isRateLimit) {
        rateLimiter.noteCooldown(delayMs);
      }
      response.body?.cancel();
      release();
      await delay(delayMs);
    } catch (err) {
      lastError = err;
      release();
      if (attempt === MAX_ATTEMPTS) break;
      await delay(computeDelayMs(attempt, null, false));
    }
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new ProviderRequestFailedError(label, provider, url, message);
}

function buildHeaders(config: HadrixConfig, provider: LLMProvider, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.api.headers
  };

  if (provider === LLMProviderId.OpenAI) {
    headers.Authorization = `Bearer ${apiKey}`;
  }
  if (provider === LLMProviderId.Anthropic) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = ANTHROPIC_VERSION;
  }

  return headers;
}

function splitSystemMessages(messages: ChatMessage[]): { system: string; rest: ChatMessage[] } {
  const systemParts: string[] = [];
  const rest: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
    } else {
      rest.push(message);
    }
  }
  return { system: systemParts.join("\n"), rest };
}

function extractOpenAiContent(payload: ChatCompletionResponse & ResponsesApiResponse): string | null {
  const content = payload.choices?.[0]?.message?.content;
  if (content) return content;

  const outputText = payload.output_text;
  if (outputText && outputText.trim()) return outputText;

  const outputParts =
    payload.output
      ?.flatMap((item) => item.content ?? [])
      .map((part) => part.text)
      .filter((text): text is string => Boolean(text))
      .join("") ?? "";

  if (outputParts.trim()) return outputParts;
  return null;
}

function extractAnthropicContent(payload: AnthropicMessageResponse): string | null {
  const content =
    payload.content
      ?.map((part) => part.text)
      .filter((text): text is string => Boolean(text))
      .join("") ?? "";
  if (content.trim()) return content;
  return null;
}

export async function runChatCompletion(config: HadrixConfig, messages: ChatMessage[]): Promise<string> {
  const provider = config.llm.provider;
  const apiKey = config.llm.apiKey || config.api.apiKey;

  if (!apiKey) {
    throw new LlmMissingApiKeyError();
  }

  rateLimiter.configure({
    maxConcurrency: config.llm.maxConcurrency ?? null,
    requestsPerMinute: config.llm.rateLimit?.requestsPerMinute ?? null,
    tokensPerMinute: config.llm.rateLimit?.tokensPerMinute ?? null,
  });

  const model = config.llm.model || "";
  const isGpt5 = provider === LLMProviderId.OpenAI && model.toLowerCase().startsWith("gpt-5");
  const maxOutputTokens = isGpt5 ? Math.max(config.llm.maxTokens, 2048) : config.llm.maxTokens;
  const requestTokens = estimateTokensFromMessages(messages, maxOutputTokens);

  if (provider === LLMProviderId.Anthropic) {
    const { system, rest } = splitSystemMessages(messages);
    const body: Record<string, unknown> = {
      model: config.llm.model,
      messages: rest.map((message) => ({
        role: message.role,
        content: message.content
      })),
      max_tokens: config.llm.maxTokens,
      temperature: config.llm.temperature
    };
    if (system.trim()) {
      body.system = system;
    }

    const response = await safeFetch(
      config.llm.endpoint,
      {
        method: "POST",
        headers: buildHeaders(config, provider, apiKey),
        body: JSON.stringify(body)
      },
      provider,
      "LLM",
      requestTokens
    );

    const payload = (await response.json()) as AnthropicMessageResponse;
    if (!response.ok) {
      const message = payload.error?.message || `LLM request failed with status ${response.status}`;
      throw new ProviderApiResponseError(message);
    }

    const content = extractAnthropicContent(payload);
    if (content) return content;

    const preview = JSON.stringify(payload).slice(0, 2000);
    throw new Error(`LLM response missing message content. Response preview: ${preview}`);
  }

  const useMaxCompletionTokens = isGpt5;
  const endpoint = isGpt5
    ? config.llm.endpoint.replace(/\/v1\/chat\/completions\/?$/, "/v1/responses")
    : config.llm.endpoint;
  const response = await safeFetch(
    endpoint,
    {
      method: "POST",
      headers: buildHeaders(config, provider, apiKey),
      body: JSON.stringify(
        useMaxCompletionTokens
          ? {
              model: config.llm.model,
              input: messages.map((message) => ({
                role: message.role,
                content: [{ type: "input_text", text: message.content }]
              })),
              max_output_tokens: maxOutputTokens,
              reasoning: { effort: "low" },
              text: { format: { type: "text" }, verbosity: "low" }
            }
          : {
              model: config.llm.model,
              messages,
              temperature: config.llm.temperature,
              max_tokens: config.llm.maxTokens
            }
      )
    },
    provider,
    "LLM",
    requestTokens
  );

  const payload = (await response.json()) as ChatCompletionResponse & ResponsesApiResponse;

  if (!response.ok) {
    const message = payload.error?.message || `LLM request failed with status ${response.status}`;
    throw new ProviderApiResponseError(message);
  }

  const content = extractOpenAiContent(payload);
  if (content) return content;

  const preview = JSON.stringify(payload).slice(0, 2000);
  throw new Error(`LLM response missing message content. Response preview: ${preview}`);
}
