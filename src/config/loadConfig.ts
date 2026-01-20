import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

export interface HadrixConfig {
  projectRoot: string;
  stateDir: string;
  api: {
    baseUrl: string;
    apiKey: string;
    headers: Record<string, string>;
  };
  embeddings: {
    model: string;
    endpoint: string;
    batchSize: number;
    dimensions: number;
  };
  llm: {
    model: string;
    endpoint: string;
    maxTokens: number;
    temperature: number;
  };
  chunking: {
    maxChars: number;
    overlapChars: number;
    maxFileSizeBytes: number;
    includeExtensions: string[];
    exclude: string[];
  };
  vector: {
    extension: "sqlite-vss";
    extensionPath: string;
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

  const baseUrl =
    readEnv("HADRIX_API_BASE") ||
    configFile.api?.baseUrl ||
    "";

  const apiKey = readEnv("HADRIX_API_KEY") || configFile.api?.apiKey || "";

  const headers = {
    ...configFile.api?.headers,
    ...parseJsonEnv("HADRIX_API_HEADERS")
  };

  const embeddingsEndpoint =
    readEnv("HADRIX_EMBEDDINGS_ENDPOINT") ||
    configFile.embeddings?.endpoint ||
    (baseUrl ? `${baseUrl.replace(/\/$/, "")}/v1/embeddings` : "");

  const llmEndpoint =
    readEnv("HADRIX_LLM_ENDPOINT") ||
    configFile.llm?.endpoint ||
    (baseUrl ? `${baseUrl.replace(/\/$/, "")}/v1/chat/completions` : "");

  const cfg: HadrixConfig = {
    projectRoot: params.projectRoot,
    stateDir: path.join(params.projectRoot, ".hadrix"),
    api: {
      baseUrl,
      apiKey,
      headers
    },
    embeddings: {
      model: readEnv("HADRIX_EMBEDDINGS_MODEL") || configFile.embeddings?.model || "text-embedding-3-small",
      endpoint: embeddingsEndpoint,
      batchSize: configFile.embeddings?.batchSize ?? 64,
      dimensions: configFile.embeddings?.dimensions ?? 1536
    },
    llm: {
      model: readEnv("HADRIX_LLM_MODEL") || configFile.llm?.model || "gpt-4o-mini",
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
      extension: "sqlite-vss",
      extensionPath:
        readEnv("HADRIX_VECTOR_EXTENSION_PATH") || configFile.vector?.extensionPath || ""
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
    throw new Error("Missing API key. Set HADRIX_API_KEY or api.apiKey in hadrix.config.json.");
  }

  if (!cfg.api.baseUrl) {
    throw new Error("Missing API base URL. Set HADRIX_API_BASE or api.baseUrl in hadrix.config.json.");
  }

  if (!cfg.vector.extensionPath) {
    throw new Error(
      "Missing SQLite vector extension path. Set HADRIX_VECTOR_EXTENSION_PATH or vector.extensionPath in hadrix.config.json."
    );
  }

  return {
    ...cfg,
    ...params.overrides
  };
}
