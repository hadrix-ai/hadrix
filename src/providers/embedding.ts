import type { HadrixConfig, Provider } from "../config/loadConfig.js";

interface EmbeddingResponseItem {
  embedding: number[];
  index?: number;
}

interface EmbeddingResponse {
  data?: EmbeddingResponseItem[];
  error?: { message?: string };
}

interface GeminiEmbeddingResponse {
  embeddings?: Array<{ values?: number[] }>;
  error?: { message?: string };
}

async function safeFetch(
  url: string,
  options: RequestInit,
  provider: Provider,
  label: string
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} request failed (${provider}) to ${url}: ${message}`);
  }
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

function normalizeGeminiEmbeddings(payload: GeminiEmbeddingResponse, expected: number): number[][] {
  const embeddings = payload.embeddings ?? [];
  const vectors = embeddings
    .map((item) => item.values)
    .filter((values): values is number[] => Array.isArray(values));

  if (vectors.length !== expected) {
    throw new Error(`Embedding response length mismatch: expected ${expected}, got ${vectors.length}.`);
  }

  return vectors;
}

export async function embedTexts(config: HadrixConfig, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const provider = config.embeddings.provider;
  const apiKey = config.embeddings.apiKey || config.api.apiKey;

  if (!apiKey) {
    throw new Error("Missing embeddings API key.");
  }

  if (provider === "gemini") {
    const modelName = config.embeddings.model.startsWith("models/")
      ? config.embeddings.model
      : `models/${config.embeddings.model}`;
    const response = await safeFetch(
      config.embeddings.endpoint,
      {
        method: "POST",
        headers: buildHeaders(config, provider, apiKey),
        body: JSON.stringify({
          requests: texts.map((text) => ({
            model: modelName,
            content: { parts: [{ text }] },
            outputDimensionality: config.embeddings.dimensions
          }))
        })
      },
      provider,
      "Embedding"
    );

    const payload = (await response.json()) as GeminiEmbeddingResponse;

    if (!response.ok) {
      const message = payload.error?.message || `Embedding request failed with status ${response.status}`;
      throw new Error(message);
    }

    return normalizeGeminiEmbeddings(payload, texts.length);
  }

  const includeDimensions =
    provider === "openai" && config.embeddings.model.startsWith("text-embedding-3");

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
    throw new Error(message);
  }

  const items = Array.isArray(payload.data) ? payload.data.slice() : [];
  items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  const embeddings = items.map((item) => item.embedding).filter(Boolean);

  if (embeddings.length !== texts.length) {
    throw new Error(`Embedding response length mismatch: expected ${texts.length}, got ${embeddings.length}.`);
  }

  return embeddings;
}
