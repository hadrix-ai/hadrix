import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseJsonEnv, readEnv, readFirstEnv } from "./env.js";
import {
  DEFAULT_ESLINT_EXTENSIONS,
  DEFAULT_EXCLUDES,
  DEFAULT_INCLUDE_EXTENSIONS,
  DEFAULT_SEMGREP_CONFIGS,
  defaultBaseUrl,
  defaultLlmModel
} from "./defaults.js";
import {
  ConfigMissingApiBaseUrlError,
  ConfigMissingApiKeyError,
  ConfigUnsupportedProviderError
} from "../errors/config.errors.js";

export const LLMProviderId = {
  OpenAI: "openai",
  Anthropic: "anthropic",
  Claude: "claude"
} as const;

export type LLMProvider = typeof LLMProviderId.OpenAI;

export interface HadrixConfig {
  projectRoot: string;
  repoPath?: string | null;
  stateDir: string;
  api: {
    provider: LLMProvider;
    baseUrl: string;
    apiKey: string;
    headers: Record<string, string>;
  };
  llm: {
    provider: LLMProvider;
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
  sampling: {
    maxFiles: number;
    maxChunksPerFile: number;
  };
  staticScanners: {
    semgrep: {
      path?: string | null;
      configs: string[];
      timeoutSeconds: number;
    };
    gitleaks: {
      path?: string | null;
    };
    osvScanner: {
      path?: string | null;
    };
    eslint: {
      enabled: boolean;
      extensions: string[];
      ignorePatterns: string[];
    };
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

function normalizeProvider(raw: string | undefined | null): LLMProvider {
  const value = (raw || "").toLowerCase();
  if (value === LLMProviderId.OpenAI) {
    return value as LLMProvider;
  }
  if (value === LLMProviderId.Anthropic || value === LLMProviderId.Claude) {
    throw new ConfigUnsupportedProviderError();
  }
  return LLMProviderId.OpenAI;
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

  const baseUrl = readEnv("HADRIX_API_BASE") || configFile.api?.baseUrl || defaultBaseUrl(provider);

  const llmBaseUrl =
    readEnv("HADRIX_LLM_BASE") ||
    configFile.llm?.baseUrl ||
    (llmProvider === LLMProviderId.OpenAI ? baseUrl : defaultBaseUrl(llmProvider));

  const apiKey =
    readFirstEnv(["HADRIX_API_KEY", "OPENAI_API_KEY"]) ||
    configFile.api?.apiKey ||
    "";

  const llmApiKey =
    readFirstEnv(["HADRIX_LLM_API_KEY", "HADRIX_API_KEY", "OPENAI_API_KEY"]) ||
    configFile.llm?.apiKey ||
    apiKey;

  const headers = {
    ...configFile.api?.headers,
    ...parseJsonEnv("HADRIX_API_HEADERS")
  };

  const llmModel = readEnv("HADRIX_LLM_MODEL") || configFile.llm?.model || defaultLlmModel(llmProvider);

  const llmEndpoint =
    readEnv("HADRIX_LLM_ENDPOINT") ||
    configFile.llm?.endpoint ||
    `${llmBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  const cfg: HadrixConfig = {
    projectRoot: params.projectRoot,
    repoPath: readEnv("HADRIX_REPO_PATH") || configFile.repoPath || null,
    stateDir: path.join(params.projectRoot, ".hadrix"),
    api: {
      provider,
      baseUrl,
      apiKey,
      headers
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
    sampling: {
      maxFiles: configFile.sampling?.maxFiles ?? 80,
      maxChunksPerFile: configFile.sampling?.maxChunksPerFile ?? 5
    },
    staticScanners: {
      semgrep: {
        path: readEnv("HADRIX_SEMGREP_PATH") || configFile.staticScanners?.semgrep?.path || null,
        configs:
          (readEnv("HADRIX_SEMGREP_CONFIG")?.split(",").map((v) => v.trim()).filter(Boolean)) ||
          configFile.staticScanners?.semgrep?.configs ||
          DEFAULT_SEMGREP_CONFIGS,
        timeoutSeconds: configFile.staticScanners?.semgrep?.timeoutSeconds ?? 120
      },
      gitleaks: {
        path: readEnv("HADRIX_GITLEAKS_PATH") || configFile.staticScanners?.gitleaks?.path || null
      },
      osvScanner: {
        path: readEnv("HADRIX_OSV_SCANNER_PATH") || configFile.staticScanners?.osvScanner?.path || null
      },
      eslint: {
        enabled: configFile.staticScanners?.eslint?.enabled ?? true,
        extensions: configFile.staticScanners?.eslint?.extensions ?? DEFAULT_ESLINT_EXTENSIONS,
        ignorePatterns:
          configFile.staticScanners?.eslint?.ignorePatterns ??
          configFile.chunking?.exclude ??
          DEFAULT_EXCLUDES
      }
    },
    output: {
      format: (configFile.output?.format as "text" | "json") ?? "text"
    }
  };

  if (!cfg.api.apiKey) {
    throw new ConfigMissingApiKeyError();
  }

  if (!cfg.api.baseUrl) {
    throw new ConfigMissingApiBaseUrlError();
  }

  return {
    ...cfg,
    ...params.overrides
  };
}
