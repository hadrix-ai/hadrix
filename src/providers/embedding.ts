import type { HadrixConfig } from "../config/loadConfig.js";

interface EmbeddingResponseItem {
  embedding: number[];
  index?: number;
}

interface EmbeddingResponse {
  data?: EmbeddingResponseItem[];
  error?: { message?: string };
}

function buildHeaders(config: HadrixConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.api.apiKey}`,
    ...config.api.headers
  };
}

export async function embedTexts(config: HadrixConfig, texts: string[]): Promise<number[][]> {
  if (!texts.length) return [];

  const response = await fetch(config.embeddings.endpoint, {
    method: "POST",
    headers: buildHeaders(config),
    body: JSON.stringify({
      model: config.embeddings.model,
      input: texts
    })
  });

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
