export const DEFAULT_INCLUDE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".json",
  ".py",
  ".go",
  ".rb",
  ".java",
  ".cs",
  ".php",
  ".rs",
  ".kt",
  ".swift",
  ".sql"
];

export const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.hadrix/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/out/**"
];

export const DEFAULT_ESLINT_EXTENSIONS = [
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs"
];

export const DEFAULT_QUERIES = [
  "authentication session token jwt api key",
  "sql query database orm raw query",
  "command execution shell exec spawn eval",
  "http handler request validation",
  "file upload path traversal",
  "crypto secret key encryption"
];

const DEFAULT_BASE_URLS = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com"
} as const;

const DEFAULT_EMBEDDING_MODELS = {
  openai: "text-embedding-3-small"
} as const;

const DEFAULT_LLM_MODELS = {
  openai: "gpt-5.2-codex",
  anthropic: "claude-opus-4-5"
} as const;

const CHEAP_LLM_MODELS = {
  openai: "gpt-5.1-codex-mini",
  anthropic: "claude-haiku-4-5"
} as const;

type DefaultProviderId = keyof typeof DEFAULT_BASE_URLS;
type EmbeddingProviderId = keyof typeof DEFAULT_EMBEDDING_MODELS;

export function defaultBaseUrl(provider: DefaultProviderId): string {
  return DEFAULT_BASE_URLS[provider];
}

export function defaultEmbeddingModel(provider: EmbeddingProviderId): string {
  return DEFAULT_EMBEDDING_MODELS[provider];
}

export function defaultLlmModel(provider: DefaultProviderId): string {
  return DEFAULT_LLM_MODELS[provider];
}

export function cheapLlmModel(provider: keyof typeof CHEAP_LLM_MODELS): string {
  return CHEAP_LLM_MODELS[provider];
}
