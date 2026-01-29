import { setTimeout as delay } from "node:timers/promises";

import { LLMProviderId } from "../../config/loadConfig.js";
import type { HadrixConfig, LLMProvider } from "../../config/loadConfig.js";
import {
  EmbeddingMissingApiKeyError,
  EmbeddingResponseLengthMismatchError,
  ProviderApiResponseError,
  ProviderRequestFailedError
} from "../../errors/provider.errors.js";

interface EmbeddingResponseItem {
  embedding: number[];
  index?: number;
}

interface EmbeddingResponse {
  data?: EmbeddingResponseItem[];
  error?: { message?: string };
}

const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 5000;

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const timestamp = Date.parse(value);
  if (!Number.isNaN(timestamp)) return timestamp - Date.now();
  return null;
}

function computeDelayMs(attempt: number, retryAfter: string | null): number {
  const retryAfterMs = parseRetryAfterMs(retryAfter);
  if (retryAfterMs !== null) {
    return Math.min(MAX_DELAY_MS, Math.max(0, retryAfterMs));
  }
  const backoff = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** (attempt - 1));
  const jitter = Math.floor(Math.random() * 100);
  return backoff + jitter;
}

async function safeFetch(
  url: string,
  options: RequestInit,
  provider: LLMProvider,
  label: string
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, options);
      if (!RETRYABLE_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
        return response;
      }
      response.body?.cancel();
      await delay(computeDelayMs(attempt, response.headers.get("retry-after")));
    } catch (err) {
      lastError = err;
      if (attempt === MAX_ATTEMPTS) break;
      await delay(computeDelayMs(attempt, null));
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

  return headers;
}

export async function embedTexts(config: HadrixConfig, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const provider = config.embeddings.provider;
  const apiKey = config.embeddings.apiKey || config.api.apiKey;

  if (!apiKey) {
    throw new EmbeddingMissingApiKeyError();
  }

  const includeDimensions =
    provider === LLMProviderId.OpenAI && config.embeddings.model.startsWith("text-embedding-3");

  const response = await safeFetch(
    config.embeddings.endpoint,
    {
      method: "POST",
      headers: buildHeaders(config, provider, apiKey),
      body: JSON.stringify({
        model: config.embeddings.model,
        input: texts,
        ...(includeDimensions ? { dimensions: config.embeddings.dimensions } : {})
      })
    },
    provider,
    "Embedding"
  );

  const payload = (await response.json()) as EmbeddingResponse;

  if (!response.ok) {
    const message = payload.error?.message || `Embedding request failed with status ${response.status}`;
    throw new ProviderApiResponseError(message);
  }

  const items = Array.isArray(payload.data) ? payload.data.slice() : [];
  items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const embeddings = items.map((item) => item.embedding).filter(Boolean);

  if (embeddings.length !== texts.length) {
    throw new EmbeddingResponseLengthMismatchError(texts.length, embeddings.length);
  }

  return embeddings;
}
