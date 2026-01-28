export class ProviderRequestFailedError extends Error {
  constructor(label: string, provider: string, url: string, message: string) {
    super(`${label} request failed (${provider}) to ${url}: ${message}`);
    this.name = "ProviderRequestFailedError";
  }
}

export class ProviderApiResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderApiResponseError";
  }
}

export class EmbeddingMissingApiKeyError extends Error {
  constructor() {
    super("Missing embeddings API key.");
    this.name = "EmbeddingMissingApiKeyError";
  }
}

export class LlmMissingApiKeyError extends Error {
  constructor() {
    super("Missing LLM API key.");
    this.name = "LlmMissingApiKeyError";
  }
}

export class EmbeddingResponseLengthMismatchError extends Error {
  constructor(expected: number, actual: number) {
    super(`Embedding response length mismatch: expected ${expected}, got ${actual}.`);
    this.name = "EmbeddingResponseLengthMismatchError";
  }
}

export class LlmResponseMissingContentError extends Error {
  constructor() {
    super("LLM response missing message content.");
    this.name = "LlmResponseMissingContentError";
  }
}
