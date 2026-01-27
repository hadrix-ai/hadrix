import { setTimeout as delay } from "node:timers/promises";

import type { HadrixConfig, Provider } from "../config/loadConfig.js";

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

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
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
  provider: Provider,
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
  throw new Error(`${label} request failed (${provider}) to ${url}: ${message}`);
}

function buildHeaders(config: HadrixConfig, provider: Provider, apiKey: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...config.api.headers
  };

  if (provider === "openai") {
    headers.Authorization = `Bearer ${apiKey}`;
  } else if (provider === "gemini") {
    headers["x-goog-api-key"] = apiKey;
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

export async function runChatCompletion(config: HadrixConfig, messages: ChatMessage[]): Promise<string> {
  const provider = config.llm.provider;
  const apiKey = config.llm.apiKey || config.api.apiKey;

  if (!apiKey) {
    throw new Error("Missing LLM API key.");
  }

  if (provider === "gemini") {
    const { system, rest } = splitSystemMessages(messages);
    const response = await safeFetch(
      config.llm.endpoint,
      {
        method: "POST",
        headers: buildHeaders(config, provider, apiKey),
        body: JSON.stringify({
          system_instruction: system ? { parts: [{ text: system }] } : undefined,
          contents: rest.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }]
          })),
          generationConfig: {
            temperature: config.llm.temperature,
            maxOutputTokens: config.llm.maxTokens
          }
        })
      },
      provider,
      "LLM"
    );

    const payload = (await response.json()) as GeminiResponse;

    if (!response.ok) {
      const message = payload.error?.message || `LLM request failed with status ${response.status}`;
      throw new Error(message);
    }

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text)
      .filter(Boolean)
      .join("");

    if (!text) {
      throw new Error("LLM response missing message content.");
    }

    return text;
  }

  const response = await safeFetch(
    config.llm.endpoint,
    {
      method: "POST",
      headers: buildHeaders(config, provider, apiKey),
      body: JSON.stringify({
        model: config.llm.model,
        messages,
        temperature: config.llm.temperature,
        max_tokens: config.llm.maxTokens
      })
    },
    provider,
    "LLM"
  );

  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    const message = payload.error?.message || `LLM request failed with status ${response.status}`;
    throw new Error(message);
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM response missing message content.");
  }

  return content;
}
