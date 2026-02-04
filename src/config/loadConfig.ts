import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parseJsonEnv, readEnv, readEnvRaw, readFirstEnv } from "./env.js";
import {
  DEFAULT_ESLINT_EXTENSIONS,
  DEFAULT_EXCLUDES,
  DEFAULT_INCLUDE_EXTENSIONS,
  defaultBaseUrl,
  defaultLlmModel,
  powerLlmModel
} from "./defaults.js";
import {
  ConfigMissingApiBaseUrlError,
  ConfigMissingApiKeyError
} from "../errors/config.errors.js";

export const LLMProviderId = {
  OpenAI: "openai",
  Anthropic: "anthropic"
} as const;

const LLMProviderAlias = {
  Claude: "claude"
} as const;

export type LLMProvider = typeof LLMProviderId[keyof typeof LLMProviderId];

const PROVIDER_API_KEY_ENV: Record<LLMProvider, string> = {
  [LLMProviderId.OpenAI]: "OPENAI_API_KEY",
  [LLMProviderId.Anthropic]: "ANTHROPIC_API_KEY"
};

const PROVIDER_API_BASE_ENV: Record<LLMProvider, string> = {
  [LLMProviderId.OpenAI]: "OPENAI_API_BASE",
  [LLMProviderId.Anthropic]: "ANTHROPIC_API_BASE"
};

const PROVIDER_ALIASES: Record<string, LLMProvider> = {
  [LLMProviderAlias.Claude]: LLMProviderId.Anthropic
};

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
    maxConcurrency?: number;
    ruleScanConcurrency?: number;
    estimatedTokensPerTask?: number;
    mappingBatchSize?: number;
    understandingMaxPromptTokens?: number;
    understandingMinBatchSize?: number;
    understandingMaxBatchChunks?: number;
    maxRulesPerChunkDefault?: number;
    maxRulesPerChunkHighRisk?: number;
    minRulesPerChunk?: number;
    ruleEvalMaxPromptTokens?: number;
    ruleEvalMaxRulesPerChunkSoft?: number;
    ruleEvalMaxRulesPerChunkHard?: number;
    reasoning?: boolean;
    reasoningModel?: string;
    rateLimit?: {
      requestsPerMinute?: number;
      tokensPerMinute?: number;
    };
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
  powerMode?: boolean;
}

function normalizeProvider(raw: string | undefined | null): LLMProvider {
  const value = (raw || "").toLowerCase();
  if (!value) return LLMProviderId.OpenAI;
  if (value === LLMProviderId.OpenAI || value === LLMProviderId.Anthropic) {
    return value as LLMProvider;
  }
  const alias = PROVIDER_ALIASES[value];
  if (alias) return alias;
  return LLMProviderId.OpenAI;
}

function parsePositiveNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed <= 0) return null;
  return parsed;
}

function parseOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return undefined;
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

  const baseUrl =
    readFirstEnv(["HADRIX_API_BASE", PROVIDER_API_BASE_ENV[provider]]) ||
    configFile.api?.baseUrl ||
    defaultBaseUrl(provider);

  const llmBaseUrl =
    readFirstEnv(["HADRIX_LLM_BASE", PROVIDER_API_BASE_ENV[llmProvider]]) ||
    configFile.llm?.baseUrl ||
    (llmProvider === provider ? baseUrl : defaultBaseUrl(llmProvider));

  const apiKey =
    readFirstEnv(["HADRIX_API_KEY", PROVIDER_API_KEY_ENV[provider]]) ||
    configFile.api?.apiKey ||
    "";

  const llmApiKey =
    readFirstEnv(["HADRIX_LLM_API_KEY", "HADRIX_API_KEY", PROVIDER_API_KEY_ENV[llmProvider]]) ||
    configFile.llm?.apiKey ||
    apiKey;

  const headers = {
    ...configFile.api?.headers,
    ...parseJsonEnv("HADRIX_API_HEADERS")
  };

  const resolvedLlmModel =
    readEnv("HADRIX_LLM_MODEL") || configFile.llm?.model || defaultLlmModel(llmProvider);
  const llmModel = params.powerMode ? powerLlmModel(llmProvider) : resolvedLlmModel;

  const llmReasoning =
    parseOptionalBoolean(readEnvRaw("HADRIX_LLM_REASONING")) ??
    parseOptionalBoolean(configFile.llm?.reasoning) ??
    true;

  const llmReasoningModelRaw =
    readEnv("HADRIX_LLM_REASONING_MODEL") || configFile.llm?.reasoningModel;
  const llmReasoningModel =
    typeof llmReasoningModelRaw === "string" && llmReasoningModelRaw.trim()
      ? llmReasoningModelRaw.trim()
      : llmModel;

  const defaultLlmEndpoint =
    llmProvider === LLMProviderId.Anthropic
      ? `${llmBaseUrl.replace(/\/$/, "")}/v1/messages`
      : `${llmBaseUrl.replace(/\/$/, "")}/v1/chat/completions`;

  const llmEndpoint =
    readEnv("HADRIX_LLM_ENDPOINT") ||
    configFile.llm?.endpoint ||
    defaultLlmEndpoint;

  const llmMaxConcurrency =
    parsePositiveNumber(readEnv("HADRIX_LLM_MAX_CONCURRENCY")) ??
    parsePositiveNumber(configFile.llm?.maxConcurrency);

  const llmRuleScanConcurrency =
    parsePositiveNumber(readEnv("HADRIX_RULE_SCAN_CONCURRENCY")) ??
    parsePositiveNumber(configFile.llm?.ruleScanConcurrency);

  const llmRequestsPerMinute =
    parsePositiveNumber(readEnv("HADRIX_LLM_REQUESTS_PER_MINUTE")) ??
    parsePositiveNumber(configFile.llm?.rateLimit?.requestsPerMinute);

  const llmTokensPerMinute =
    parsePositiveNumber(readEnv("HADRIX_LLM_TOKENS_PER_MINUTE")) ??
    parsePositiveNumber(configFile.llm?.rateLimit?.tokensPerMinute);

  const llmEstimatedTokensPerTask =
    parsePositiveNumber(readEnv("HADRIX_LLM_EST_TOKENS_PER_TASK")) ??
    parsePositiveNumber(configFile.llm?.estimatedTokensPerTask);

  const llmMappingBatchSize =
    parsePositiveNumber(readEnv("HADRIX_LLM_MAPPING_BATCH_SIZE")) ??
    parsePositiveNumber(configFile.llm?.mappingBatchSize);

  const understandingMaxPromptTokens =
    parsePositiveNumber(readEnv("HADRIX_UNDERSTANDING_MAX_PROMPT_TOKENS")) ??
    parsePositiveNumber(configFile.llm?.understandingMaxPromptTokens) ??
    6500;

  const understandingMinBatchSize =
    parsePositiveNumber(readEnv("HADRIX_UNDERSTANDING_MIN_BATCH_SIZE")) ??
    parsePositiveNumber(configFile.llm?.understandingMinBatchSize) ??
    1;

  const understandingMaxBatchChunks =
    parsePositiveNumber(readEnv("HADRIX_UNDERSTANDING_MAX_BATCH_CHUNKS")) ??
    parsePositiveNumber(configFile.llm?.understandingMaxBatchChunks) ??
    8;

  const ruleEvalMaxPromptTokens =
    parsePositiveNumber(readEnv("HADRIX_RULE_EVAL_MAX_PROMPT_TOKENS")) ??
    parsePositiveNumber(configFile.llm?.ruleEvalMaxPromptTokens) ??
    6500;

  const ruleEvalMaxRulesPerChunkSoft =
    parsePositiveNumber(readEnv("HADRIX_RULE_EVAL_MAX_RULES_PER_CHUNK_SOFT")) ??
    parsePositiveNumber(configFile.llm?.ruleEvalMaxRulesPerChunkSoft) ??
    15;

  const ruleEvalMaxRulesPerChunkHard =
    parsePositiveNumber(readEnv("HADRIX_RULE_EVAL_MAX_RULES_PER_CHUNK_HARD")) ??
    parsePositiveNumber(configFile.llm?.ruleEvalMaxRulesPerChunkHard) ??
    25;

  const maxRulesPerChunkDefault =
    parsePositiveNumber(readEnv("HADRIX_MAX_RULES_PER_CHUNK_DEFAULT")) ??
    parsePositiveNumber(configFile.llm?.maxRulesPerChunkDefault) ??
    5;

  const maxRulesPerChunkHighRisk =
    parsePositiveNumber(readEnv("HADRIX_MAX_RULES_PER_CHUNK_HIGH_RISK")) ??
    parsePositiveNumber(configFile.llm?.maxRulesPerChunkHighRisk) ??
    10;

  const minRulesPerChunk =
    parsePositiveNumber(readEnv("HADRIX_MIN_RULES_PER_CHUNK")) ??
    parsePositiveNumber(configFile.llm?.minRulesPerChunk) ??
    3;

  const llmRateLimit = {
    ...(llmRequestsPerMinute ? { requestsPerMinute: llmRequestsPerMinute } : {}),
    ...(llmTokensPerMinute ? { tokensPerMinute: llmTokensPerMinute } : {}),
  };

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
      temperature: configFile.llm?.temperature ?? 0.1,
      maxConcurrency: llmMaxConcurrency ?? undefined,
      ruleScanConcurrency: llmRuleScanConcurrency ?? undefined,
      estimatedTokensPerTask: llmEstimatedTokensPerTask ?? undefined,
      mappingBatchSize: llmMappingBatchSize ?? undefined,
      understandingMaxPromptTokens,
      understandingMinBatchSize,
      understandingMaxBatchChunks,
      ruleEvalMaxPromptTokens,
      ruleEvalMaxRulesPerChunkSoft,
      ruleEvalMaxRulesPerChunkHard,
      maxRulesPerChunkDefault,
      maxRulesPerChunkHighRisk,
      minRulesPerChunk,
      reasoning: llmReasoning,
      reasoningModel: llmReasoningModel,
      rateLimit: Object.keys(llmRateLimit).length ? llmRateLimit : undefined,
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
