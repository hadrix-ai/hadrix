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

export const DEFAULT_SEMGREP_CONFIGS = [
  "p/default",
  "p/security-audit",
  "p/owasp-top-ten",
  "p/cwe-top-25",
  "p/xss",
  "p/sql-injection",
  "p/jwt",
  "p/secrets",
  "p/javascript",
  "p/typescript",
  "p/react"
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
  openai: "https://api.openai.com"
} as const;

const DEFAULT_EMBEDDING_MODELS = {
  openai: "text-embedding-3-small"
} as const;

const DEFAULT_LLM_MODELS = {
  openai: "gpt-5-nano"
} as const;

type DefaultProviderId = keyof typeof DEFAULT_BASE_URLS;

export function defaultBaseUrl(provider: DefaultProviderId): string {
  return DEFAULT_BASE_URLS[provider];
}

export function defaultEmbeddingModel(provider: DefaultProviderId): string {
  return DEFAULT_EMBEDDING_MODELS[provider];
}

export function defaultLlmModel(provider: DefaultProviderId): string {
  return DEFAULT_LLM_MODELS[provider];
}
