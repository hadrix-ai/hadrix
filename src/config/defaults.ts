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

export function defaultBaseUrl(provider: "openai" | "gemini"): string {
  if (provider === "openai") return "https://api.openai.com";
  return "https://generativelanguage.googleapis.com";
}

export function defaultEmbeddingModel(provider: "openai" | "gemini"): string {
  if (provider === "gemini") return "gemini-embedding-001";
  return "text-embedding-3-small";
}

export function defaultLlmModel(provider: "openai" | "gemini"): string {
  if (provider === "gemini") return "gemini-2.5-flash";
  return "gpt-5-nano";
}
