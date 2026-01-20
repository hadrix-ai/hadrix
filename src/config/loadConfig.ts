import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export type Provider = "openai" | "gemini";

export interface HadrixConfig {
  projectRoot: string;
  stateDir: string;
  api: {
    provider: Provider;
    baseUrl: string;
    apiKey: string;
    headers: Record<string, string>;
  };
  embeddings: {
    provider: Provider;
    apiKey?: string;
    model: string;
    endpoint: string;
    batchSize: number;
    dimensions: number;
    baseUrl?: string;
  };
  llm: {
    provider: Provider;
    apiKey?: string;
    model: string;
    endpoint: string;
    maxTokens: number;
    temperature: number;
    baseUrl?: string;
  };
  chunking: {
    maxChars: number;
    overlapChars: number;
    maxFileSizeBytes: number;
    includeExtensions: string[];
    exclude: string[];
  };
  vector: {
    extension: "sqlite-vec";
    extensionPath?: string | null;
  };
  sampling: {
    queries: string[];
    topKPerQuery: number;
    maxChunks: number;
    maxChunksPerFile: number;
  };
  output: {
    format: "text" | "json";
  };
}

export interface LoadConfigParams {
  projectRoot: string;
  configPath?: string | null;
  overrides?: Partial<HadrixConfig>;
}

const DEFAULT_INCLUDE_EXTENSIONS = [
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
  ".swift"
];

const DEFAULT_EXCLUDES = [
  "**/node_modules/**",
  "**/.git/**",
  "**/.hadrix/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/out/**"
];

const DEFAULT_QUERIES = [
  "authentication session token jwt api key",
  "sql query database orm raw query",
  "command execution shell exec spawn eval",
  "http handler request validation",
  "file upload path traversal",
  "crypto secret key encryption"
];

function readEnv(name: string): string | null {
  const value = process.env[name];
  if (!value) return null;
  return value.trim();
}

function readFirstEnv(names: string[]): string | null {
  for (const name of names) {
    const value = readEnv(name);
    if (value) return value;
  }
  return null;
}

function parseJsonEnv(name: string): Record<string, string> {
  const raw = readEnv(name);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function defaultBaseUrl(provider: Provider): string {
  if (provider === "openai") return "https://api.openai.com";
  return "https://generativelanguage.googleapis.com";
}

function defaultEmbeddingModel(provider: Provider): string {
  if (provider === "gemini") return "gemini-embedding-001";
  return "text-embedding-3-small";
}

function defaultLlmModel(provider: Provider): string {
  if (provider === "gemini") return "gemini-2.5-flash";
  return "gpt-4o-mini";
}

function normalizeGeminiModel(model: string): string {
  return model.replace(/^models\//, "");
}

function normalizeProvider(raw: string | undefined | null): Provider {
  const value = (raw || "").toLowerCase();
  if (value === "openai" || value === "gemini") {
    return value as Provider;
  }
  if (value === "anthropic" || value === "claude") {
    throw new Error("Claude/Anthropic is not supported. Use openai or gemini.");
  }
  return "openai";
}

async function loadConfigFile(projectRoot: string, configPath?: string | null): Promise<Partial<HadrixConfig>> {
  const candidates = configPath
    ? [path.resolve(projectRoot, configPath)]
    : [
        path.resolve(projectRoot, "hadrix.config.json"),
        path.resolve(projectRoot, ".hadrixrc.json")
      ];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) continue;
    const raw = await readFile(candidate, "utf-8");
    return JSON.parse(raw) as Partial<HadrixConfig>;
  }

  return {};
}

export async function loadConfig(params: LoadConfigParams): Promise<HadrixConfig> {
  const configFile = await loadConfigFile(params.projectRoot, params.configPath);

  const provider = normalizeProvider(readEnv("HADRIX_PROVIDER") || configFile.api?.provider);

  const llmProvider = normalizeProvider(
    readEnv("HADRIX_LLM_PROVIDER") || configFile.llm?.provider || provider
  );

  const embeddingsProvider = normalizeProvider(
    readEnv("HADRIX_EMBEDDINGS_PROVIDER") || configFile.embeddings?.provider || provider
  );

  const baseUrl =
    readEnv("HADRIX_API_BASE") ||
    configFile.api?.baseUrl ||
    defaultBaseUrl(provider);

  const embeddingsBaseUrl =
    readEnv("HADRIX_EMBEDDINGS_BASE") ||
    configFile.embeddings?.baseUrl ||
    (embeddingsProvider === "openai" ? baseUrl : defaultBaseUrl(embeddingsProvider));

  const llmBaseUrl =
    readEnv("HADRIX_LLM_BASE") ||
    configFile.llm?.baseUrl ||
    (llmProvider === "openai" ? baseUrl : defaultBaseUrl(llmProvider));

  const apiKey =
    readFirstEnv(["HADRIX_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) ||
    configFile.api?.apiKey ||
    "";

  const embeddingsApiKey =
    readFirstEnv(["HADRIX_EMBEDDINGS_API_KEY", "HADRIX_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) ||
    configFile.embeddings?.apiKey ||
    apiKey;

  const llmApiKey =
    readFirstEnv(["HADRIX_LLM_API_KEY", "HADRIX_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"]) ||
    configFile.llm?.apiKey ||
    apiKey;

  const headers = {
    ...configFile.api?.headers,
    ...parseJsonEnv("HADRIX_API_HEADERS")
  };

  const embeddingsModelRaw =
    readEnv("HADRIX_EMBEDDINGS_MODEL") || configFile.embeddings?.model || defaultEmbeddingModel(embeddingsProvider);
  const llmModelRaw =
    readEnv("HADRIX_LLM_MODEL") || configFile.llm?.model || defaultLlmModel(llmProvider);

  const embeddingsModel =
    embeddingsProvider === "gemini" ? normalizeGeminiModel(embeddingsModelRaw) : embeddingsModelRaw;
  const llmModel = llmProvider === "gemini" ? normalizeGeminiModel(llmModelRaw) : llmModelRaw;

  const embeddingsEndpoint =
    readEnv("HADRIX_EMBEDDINGS_ENDPOINT") ||
    configFile.embeddings?.endpoint ||
    (embeddingsProvider === "openai"
      ? `${embeddingsBaseUrl.replace(/\/$/, "")}/v1/embeddings`
      : embeddingsProvider === "gemini"
        ? `${embeddingsBaseUrl.replace(/\/$/, "")}/v1beta/models/${embeddingsModel}:batchEmbedContents`
        : "");

  const llmEndpoint =
    readEnv("HADRIX_LLM_ENDPOINT") ||
    configFile.llm?.endpoint ||
    (llmProvider === "openai"
      ? `${llmBaseUrl.replace(/\/$/, "")}/v1/chat/completions`
      : llmProvider === "gemini"
        ? `${llmBaseUrl.replace(/\/$/, "")}/v1beta/models/${llmModel}:generateContent`
        : "");

  const cfg: HadrixConfig = {
    projectRoot: params.projectRoot,
    stateDir: path.join(params.projectRoot, ".hadrix"),
    api: {
      provider,
      baseUrl,
      apiKey,
      headers
    },
    embeddings: {
      provider: embeddingsProvider,
      apiKey: embeddingsApiKey,
      baseUrl: embeddingsBaseUrl,
      model: embeddingsModel,
      endpoint: embeddingsEndpoint,
      batchSize: configFile.embeddings?.batchSize ?? 64,
      dimensions: configFile.embeddings?.dimensions ?? 1536
    },
    llm: {
      provider: llmProvider,
      apiKey: llmApiKey,
      baseUrl: llmBaseUrl,
      model: llmModel,
      endpoint: llmEndpoint,
      maxTokens: configFile.llm?.maxTokens ?? 1200,
      temperature: configFile.llm?.temperature ?? 0.1
    },
    chunking: {
      maxChars: configFile.chunking?.maxChars ?? 1200,
      overlapChars: configFile.chunking?.overlapChars ?? 200,
      maxFileSizeBytes: configFile.chunking?.maxFileSizeBytes ?? 200 * 1024,
      includeExtensions: configFile.chunking?.includeExtensions ?? DEFAULT_INCLUDE_EXTENSIONS,
      exclude: configFile.chunking?.exclude ?? DEFAULT_EXCLUDES
    },
    vector: {
      extension: "sqlite-vec",
      extensionPath:
        readEnv("HADRIX_VECTOR_EXTENSION_PATH") || configFile.vector?.extensionPath || null
    },
    sampling: {
      queries: configFile.sampling?.queries ?? DEFAULT_QUERIES,
      topKPerQuery: configFile.sampling?.topKPerQuery ?? 8,
      maxChunks: configFile.sampling?.maxChunks ?? 80,
      maxChunksPerFile: configFile.sampling?.maxChunksPerFile ?? 2
    },
    output: {
      format: (configFile.output?.format as "text" | "json") ?? "text"
    }
  };

  if (!cfg.api.apiKey) {
    throw new Error(
      "Missing API key. Set HADRIX_API_KEY (or provider-specific key like OPENAI_API_KEY/GEMINI_API_KEY) or api.apiKey in hadrix.config.json."
    );
  }

  if (!cfg.api.baseUrl) {
    throw new Error("Missing API base URL. Set HADRIX_API_BASE or api.baseUrl in hadrix.config.json.");
  }

  return {
    ...cfg,
    ...params.overrides
  };
}
