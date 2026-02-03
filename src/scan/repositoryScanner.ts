import path from "node:path";
import crypto from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import type { HadrixConfig } from "../config/loadConfig.js";
import type {
  ExistingScanFinding,
  RepositoryFileSample,
  RepositoryScanFinding,
  Severity
} from "../types.js";
import type { ScanResumeStore } from "./scanResume.js";
import { runChatCompletion } from "../services/llm/index.js";
import {
  buildRepositoryCompositeSystemPrompt,
  buildRepositoryContextPrompt,
  buildRepositoryScanOutputSchema,
  buildRepositoryRuleBatchSystemPrompt
} from "./prompts/repositoryPrompts.js";
import {
  buildUnderstandingAndFamilyMappingSystemPrompt
} from "./prompts/llmUnderstandingPrompts.js";
import { buildOpenScanSystemPrompt } from "./prompts/openScanPrompts.js";
import { REPOSITORY_SCAN_RULES, type RuleScanDefinition } from "./catalog/repositoryRuleCatalog.js";
import {
  buildFindingIdentityKey,
  extractFindingIdentityType
} from "./dedupeKey.js";
import type { DedupeDebug } from "./debugLog.js";
import { SIGNAL_IDS, type SignalId } from "../security/signals.js";

export interface RepositoryDescriptor {
  fullName: string;
  repoPaths: string[];
  repoRoles?: string[];
  providerMetadata?: Record<string, unknown> | null;
  defaultBranch?: string | null;
}

export interface RepositoryScanInput {
  config: HadrixConfig;
  repository: RepositoryDescriptor;
  files: RepositoryFileSample[];
  existingFindings: ExistingScanFinding[];
  mapConcurrency?: number;
  debug?: DedupeDebug;
  resume?: ScanResumeStore;
  logger?: (message: string) => void;
}

export interface CompositeScanInput {
  config: HadrixConfig;
  repository: RepositoryDescriptor;
  files: RepositoryFileSample[];
  existingFindings: ExistingScanFinding[];
  priorFindings: RepositoryScanFinding[];
  debug?: DedupeDebug;
}

type LlmFamilyCandidate = {
  family: string;
  confidence: number;
  rationale?: string;
};

type LlmChunkUnderstandingSignal = {
  id: SignalId;
  evidence: string;
  confidence: number;
};

type LlmChunkUnderstandingIdentifier = {
  name: string;
  kind: "org_id" | "user_id" | "account_id" | "project_id" | "tenant_id" | "resource_id" | "unknown";
  source: string;
  trust: "untrusted" | "trusted" | "unknown";
};

type LlmChunkUnderstanding = {
  chunk_id: string;
  file_path: string;
  confidence: number;
  summary?: string;
  signals: LlmChunkUnderstandingSignal[];
  identifiers: LlmChunkUnderstandingIdentifier[];
  [key: string]: unknown;
};

type LlmFamilyMapping = {
  chunk_id: string;
  families: LlmFamilyCandidate[];
  suggested_rule_ids?: string[];
  needs_more_context: string[];
  [key: string]: unknown;
};

type LlmFileInsight = {
  file: RepositoryFileSample;
  chunkId: string;
  understanding: LlmChunkUnderstanding | null;
  familyMapping: LlmFamilyMapping | null;
  candidateRuleIds: string[];
  selectionFamilies: string[];
  selectionStrategy: "signals_primary" | "role_fallback" | "baseline_fallback";
};

type RuleCatalogEntry = {
  id: string;
  title: string;
  description: string;
  category: string;
};

type RuleScanTask = {
  ruleIds: string[];
  file: RepositoryFileSample;
  systemPrompt: string;
  existingFindings: ExistingScanFinding[];
  taskKey: string;
  llmUnderstanding: LlmChunkUnderstanding | null;
  familyMapping: LlmFamilyMapping | null;
  candidateRuleIds: string[];
};

type OpenScanTask = {
  fileInsight: LlmFileInsight;
  existingFindings: ExistingScanFinding[];
  taskKey: string;
};

const DEFAULT_MAP_CONCURRENCY = 4;
const DEFAULT_MAX_EXISTING_FINDINGS_PER_REPO = 80;
const DEFAULT_MAX_PRIOR_FINDINGS_PER_REPO = 40;
const DEFAULT_MAPPING_BATCH_SIZE = 3;
const MAX_MAPPING_BATCH_SIZE = 4;

const MAX_RULES_PER_CHUNK = 10;
const MIN_RULES_PER_CHUNK = 3;
const RULE_BATCH_SIZE = 5;

const OPEN_SCAN_FAMILIES = new Set([
  "injection",
  "access_control",
  "authentication",
  "secrets",
  "data_exposure",
  "logic_issues",
  "misconfiguration"
]);

const BASELINE_RULE_IDS = [
  "missing_authentication",
  "missing_admin_mfa",
  "idor",
  "sql_injection",
  "command_injection",
  "dangerous_html_render",
  "frontend_only_authorization",
  "missing_rate_limiting",
  "permissive_cors"
];

const SIGNAL_ID_SET = new Set<SignalId>(SIGNAL_IDS);
const IDENTIFIER_KINDS = new Set<LlmChunkUnderstandingIdentifier["kind"]>([
  "org_id",
  "user_id",
  "account_id",
  "project_id",
  "tenant_id",
  "resource_id",
  "unknown"
]);
const IDENTIFIER_TRUST_LEVELS = new Set<LlmChunkUnderstandingIdentifier["trust"]>([
  "untrusted",
  "trusted",
  "unknown"
]);

const ROLE_FAMILY_FALLBACKS: Record<string, string[]> = {
  api_handler: ["authentication", "access_control", "injection", "logic_issues"],
  db_access: ["injection", "access_control", "logic_issues"],
  auth: ["authentication", "access_control", "logic_issues"],
  frontend_ui: ["access_control", "secrets", "injection", "misconfiguration"],
  job_worker: ["logic_issues", "secrets", "injection"],
  config: ["misconfiguration", "secrets"],
  utility: ["injection", "misconfiguration"],
  test: ["misconfiguration"],
  infra: ["misconfiguration", "secrets"],
  unknown: ["access_control", "injection"]
};

const FAMILY_RULES: Record<string, string[]> = {
  injection: [
    "sql_injection",
    "unsafe_query_builder",
    "command_injection",
    "dangerous_html_render",
    "missing_input_validation",
    "missing_output_sanitization",
    "path_traversal",
    "unrestricted_file_upload",
    "nosql_injection",
    "ldap_injection",
    "xpath_injection",
    "template_injection",
    "log_injection",
    "webhook_code_execution"
  ],
  access_control: [
    "idor",
    "missing_role_check",
    "org_id_trust",
    "frontend_only_authorization",
    "frontend_direct_db_write",
    "mass_assignment",
    "missing_least_privilege",
    "weak_rls_policies"
  ],
  authentication: [
    "missing_authentication",
    "missing_admin_mfa",
    "missing_server_action_auth",
    "missing_lockout",
    "missing_secure_token_handling",
    "missing_replay_protection",
    "missing_webhook_signature",
    "jwt_validation_bypass",
    "weak_jwt_secret",
    "weak_token_generation",
    "missing_bearer_token",
    "anon_key_bearer",
    "session_fixation",
    "weak_password_hashing"
  ],
  secrets: [
    "frontend_secret_exposure",
    "sensitive_client_storage",
    "plaintext_secrets",
    "sensitive_logging",
    "command_output_logging",
    "weak_encryption"
  ],
  data_exposure: [
    "excessive_data_exposure",
    "verbose_error_messages",
    "debug_auth_leak"
  ],
  logic_issues: [
    "missing_rate_limiting",
    "missing_audit_logging",
    "unbounded_query",
    "missing_timeout",
    "missing_upload_size_limit",
    "frontend_login_rate_limit"
  ],
  misconfiguration: [
    "permissive_cors",
    "missing_security_headers",
    "debug_mode_in_production",
    "missing_webhook_config_integrity",
    "insecure_temp_files"
  ],
  dependency_risks: []
};

function buildRuleTaskKey(ruleId: string, file: RepositoryFileSample): string {
  const contentHash = crypto.createHash("sha256").update(file.content ?? "").digest("hex");
  const raw = [
    ruleId,
    file.path,
    String(file.chunkIndex),
    String(file.startLine),
    String(file.endLine),
    contentHash
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildRuleBatchTaskKey(ruleIds: string[], file: RepositoryFileSample): string {
  const contentHash = crypto.createHash("sha256").update(file.content ?? "").digest("hex");
  const raw = [
    ruleIds.join(","),
    file.path,
    String(file.chunkIndex),
    String(file.startLine),
    String(file.endLine),
    contentHash
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function buildOpenScanTaskKey(file: RepositoryFileSample): string {
  return buildRuleTaskKey("open_scan", file);
}

function buildChunkKey(file: RepositoryFileSample): string {
  const contentHash = crypto.createHash("sha256").update(file.content ?? "").digest("hex");
  const raw = [
    file.path,
    String(file.chunkIndex),
    String(file.startLine),
    String(file.endLine),
    contentHash
  ].join("|");
  return crypto.createHash("sha256").update(raw).digest("hex");
}

function chunkRuleIds(ruleIds: string[], size: number): string[][] {
  if (ruleIds.length === 0) return [];
  const batchSize = Math.max(1, Math.trunc(size));
  const batches: string[][] = [];
  for (let i = 0; i < ruleIds.length; i += batchSize) {
    batches.push(ruleIds.slice(i, i + batchSize));
  }
  return batches;
}

function buildRuleCatalogSummary(rules: RuleScanDefinition[]): RuleCatalogEntry[] {
  return rules.map((rule) => ({
    id: rule.id,
    title: rule.title,
    description: rule.description,
    category: rule.category
  }));
}

function buildRuleBatchFocus(
  ruleIds: string[],
  rulesById: Map<string, RuleScanDefinition>
): string {
  if (ruleIds.length === 1) {
    const rule = rulesById.get(ruleIds[0]);
    return `Rule scan: ${rule?.id ?? ruleIds[0]} (${rule?.title ?? "unknown"})`;
  }
  const parts = ruleIds.map((ruleId) => {
    const rule = rulesById.get(ruleId);
    return rule ? `${rule.id} (${rule.title})` : ruleId;
  });
  return `Rule scan (batched): ${parts.join("; ")}`;
}

function inferLanguage(filepath: string): string {
  const ext = path.extname(filepath || "").toLowerCase();
  switch (ext) {
    case ".ts":
    case ".mts":
    case ".cts":
      return "typescript";
    case ".tsx":
      return "typescriptreact";
    case ".js":
    case ".mjs":
    case ".cjs":
      return "javascript";
    case ".jsx":
      return "javascriptreact";
    case ".py":
      return "python";
    case ".rb":
      return "ruby";
    case ".go":
      return "go";
    case ".java":
      return "java";
    case ".cs":
      return "csharp";
    case ".php":
      return "php";
    case ".rs":
      return "rust";
    case ".kt":
    case ".kts":
      return "kotlin";
    case ".swift":
      return "swift";
    case ".sql":
      return "sql";
    case ".yaml":
    case ".yml":
      return "yaml";
    case ".json":
      return "json";
    case ".toml":
      return "toml";
    case ".md":
    case ".mdx":
      return "markdown";
    default:
      return "unknown";
  }
}

function normalizeMappingBatchSize(
  value: number | undefined,
  log: ((message: string) => void) | undefined
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_MAPPING_BATCH_SIZE;
  }
  const rounded = Math.trunc(value);
  if (rounded <= 1) return 1;
  if (rounded > MAX_MAPPING_BATCH_SIZE) {
    log?.(
      `LLM mapping batch size ${rounded} is too large; capping at ${MAX_MAPPING_BATCH_SIZE}.`
    );
    return MAX_MAPPING_BATCH_SIZE;
  }
  return rounded;
}

function splitMappingBatches(
  items: RepositoryFileSample[],
  batchSize: number
): RepositoryFileSample[][] {
  if (items.length === 0) return [];
  const batches: RepositoryFileSample[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }
  return batches;
}

function buildMappingBatches(
  files: RepositoryFileSample[],
  batchSize: number
): RepositoryFileSample[][] {
  if (batchSize <= 1) return files.map((file) => [file]);

  const byFile = new Map<string, RepositoryFileSample[]>();
  for (const file of files) {
    if (!byFile.has(file.path)) {
      byFile.set(file.path, []);
    }
    byFile.get(file.path)!.push(file);
  }

  const batches: RepositoryFileSample[][] = [];

  for (const list of byFile.values()) {
    list.sort(
      (a, b) =>
        (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0) ||
        a.startLine - b.startLine ||
        a.endLine - b.endLine
    );

    const overlapGroups = new Map<string, RepositoryFileSample[]>();
    const noOverlap: RepositoryFileSample[] = [];

    for (const sample of list) {
      if (sample.overlapGroupId) {
        if (!overlapGroups.has(sample.overlapGroupId)) {
          overlapGroups.set(sample.overlapGroupId, []);
        }
        overlapGroups.get(sample.overlapGroupId)!.push(sample);
      } else {
        noOverlap.push(sample);
      }
    }

    for (const group of overlapGroups.values()) {
      group.sort(
        (a, b) =>
          (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0) ||
          a.startLine - b.startLine
      );
      batches.push(...splitMappingBatches(group, batchSize));
    }

    if (noOverlap.length > 0) {
      noOverlap.sort(
        (a, b) =>
          (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0) ||
          a.startLine - b.startLine
      );
      let current: RepositoryFileSample[] = [noOverlap[0]];
      for (let i = 1; i < noOverlap.length; i += 1) {
        const prev = noOverlap[i - 1];
        const next = noOverlap[i];
        if (next.chunkIndex === prev.chunkIndex + 1) {
          current.push(next);
        } else {
          batches.push(...splitMappingBatches(current, batchSize));
          current = [next];
        }
      }
      if (current.length) {
        batches.push(...splitMappingBatches(current, batchSize));
      }
    }
  }

  return batches;
}

export async function scanRepository(input: RepositoryScanInput): Promise<RepositoryScanFinding[]> {
  if (input.files.length === 0) {
    return [];
  }

  const log = input.logger ?? (() => {});
  const outputSchema = buildRepositoryScanOutputSchema();
  const { buildKnowledgeContext } = await import("./knowledgeContext.js");
  const systemContext = buildRepositoryContextPrompt(
    [input.repository],
    undefined,
    buildKnowledgeContext() || undefined
  );
  const understandingAndFamilyMappingSystemPrompt = [
    buildUnderstandingAndFamilyMappingSystemPrompt(),
    systemContext
  ].filter(Boolean).join("\n\n");
  const openScanSystemPrompt = [
    buildOpenScanSystemPrompt(),
    systemContext
  ].filter(Boolean).join("\n\n");
  const ruleCatalogSummary = buildRuleCatalogSummary(REPOSITORY_SCAN_RULES);
  const ruleIdSet = new Set(REPOSITORY_SCAN_RULES.map((rule) => rule.id));
  const existingFindings = pickExistingFindings(
    input.existingFindings,
    DEFAULT_MAX_EXISTING_FINDINGS_PER_REPO
  );

  const rulesById = new Map(REPOSITORY_SCAN_RULES.map((rule) => [rule.id, rule]));

  const resumeResults = input.resume?.getRuleResults() ?? new Map<string, RepositoryScanFinding[]>();
  const resumedFindings: RepositoryScanFinding[] = [];
  const resumedOpenFindings: RepositoryScanFinding[] = [];
  let resumedTaskCount = 0;

  log("LLM scan (understanding + family mapping, single-pass)...");
  const mapConcurrency = normalizeMapConcurrency(input.mapConcurrency);
  const mappingBatchSize = normalizeMappingBatchSize(
    input.config.llm?.mappingBatchSize,
    log
  );
  const mappingBatches = buildMappingBatches(input.files, mappingBatchSize);

  const buildMappingPayload = (file: RepositoryFileSample, chunkId: string) => ({
    chunk_id: chunkId,
    file_path: file.path,
    language: inferLanguage(file.path),
    chunk_text: file.content
  });

  const buildFileInsight = (
    file: RepositoryFileSample,
    chunkId: string,
    understanding: LlmChunkUnderstanding | null,
    familyMapping: LlmFamilyMapping | null
  ): LlmFileInsight => {
    const selection = resolveCandidateRuleIds({
      understanding,
      familyMapping,
      rulesById,
      fallbackRuleIds: BASELINE_RULE_IDS
    });
    const candidateRuleIds = selection.ruleIds;
    const signalIds = extractSignalIds(understanding);
    if (input.debug) {
      logDebug(input.debug, {
        event: "llm_threat_mapping",
        file: {
          path: file.path,
          chunkIndex: file.chunkIndex,
          startLine: file.startLine,
          endLine: file.endLine
        },
        understandingConfidence: understanding?.confidence ?? 0,
        candidateRuleIds,
        signals: signalIds,
        signalCount: signalIds.length,
        selectionFamilies: selection.families,
        families: familyMapping?.families ?? [],
        suggestedRuleIds: familyMapping?.suggested_rule_ids ?? []
      });
    }
    log(
      [
        "LLM map",
        `${file.path}:${file.startLine}-${file.endLine}`,
        `signals=${signalIds.length}`,
        `families=${selection.families.length ? selection.families.join(",") : "none"}`,
        `familyCandidates=${familyMapping?.families?.length ?? 0}`,
        `suggestedRules=${familyMapping?.suggested_rule_ids?.length ?? 0}`,
        `rules=${candidateRuleIds.length}`,
        `strategy=${selection.strategy}`
      ].join(" | ")
    );
    return {
      file,
      chunkId,
      understanding,
      familyMapping,
      candidateRuleIds,
      selectionFamilies: selection.families,
      selectionStrategy: selection.strategy
    };
  };

  const mapSingleChunk = async (file: RepositoryFileSample): Promise<LlmFileInsight> => {
    const chunkId = buildChunkKey(file);
    const mappingPayload = buildMappingPayload(file, chunkId);
    const mappingResponse = await runChatCompletion(input.config, [
      { role: "system", content: understandingAndFamilyMappingSystemPrompt },
      { role: "user", content: JSON.stringify(mappingPayload, null, 2) }
    ]);

    let understanding: LlmChunkUnderstanding | null = null;
    let familyMapping: LlmFamilyMapping | null = null;
    try {
      const parsed = parseUnderstandingAndFamilyMapping(mappingResponse, {
        chunkId,
        filePath: file.path
      });
      understanding = parsed.understanding;
      familyMapping = parsed.familyMapping;
    } catch (err) {
      const savedPath = await writeLlmDebugArtifact(
        input.config,
        "llm-understanding-family-mapping",
        mappingResponse
      );
      const message = err instanceof Error ? err.message : String(err);
      log(
        `LLM understanding/family mapping parse error for ${file.path}:${file.startLine}-${file.endLine}. ${message}. Saved response: ${savedPath}`
      );
      logDebug(input.debug, {
        event: "llm_understanding_family_mapping_parse_error",
        file: {
          path: file.path,
          chunkIndex: file.chunkIndex,
          startLine: file.startLine,
          endLine: file.endLine
        },
        message,
        savedPath
      });
    }

    return buildFileInsight(file, chunkId, understanding, familyMapping);
  };

  const mapBatch = async (batch: RepositoryFileSample[]): Promise<LlmFileInsight[]> => {
    if (batch.length <= 1) {
      return [await mapSingleChunk(batch[0])];
    }

    const batchItems = batch.map((file) => ({
      file,
      chunkId: buildChunkKey(file)
    }));
    const mappingPayload = batchItems.map((item) =>
      buildMappingPayload(item.file, item.chunkId)
    );

    const mappingResponse = await runChatCompletion(input.config, [
      { role: "system", content: understandingAndFamilyMappingSystemPrompt },
      { role: "user", content: JSON.stringify(mappingPayload, null, 2) }
    ]);

    let parsedBatch: {
      results: Array<{ understanding: LlmChunkUnderstanding; familyMapping: LlmFamilyMapping } | null>;
      errors: string[];
    };
    try {
      parsedBatch = parseUnderstandingAndFamilyMappingBatch(
        mappingResponse,
        batchItems.map((item) => ({ chunkId: item.chunkId, filePath: item.file.path }))
      );
    } catch (err) {
      const savedPath = await writeLlmDebugArtifact(
        input.config,
        "llm-understanding-family-mapping-batch",
        mappingResponse
      );
      const message = err instanceof Error ? err.message : String(err);
      log(
        `LLM understanding/family mapping batch parse error for ${batchItems.length} chunks. ${message}. Saved response: ${savedPath}`
      );
      logDebug(input.debug, {
        event: "llm_understanding_family_mapping_batch_parse_error",
        message,
        savedPath,
        batchSize: batchItems.length
      });
      const fallback: LlmFileInsight[] = [];
      for (const item of batchItems) {
        fallback.push(await mapSingleChunk(item.file));
      }
      return fallback;
    }

    const { results, errors } = parsedBatch;
    const needsFallback: number[] = [];
    for (let i = 0; i < batchItems.length; i += 1) {
      if (!results[i]) {
        needsFallback.push(i);
      }
    }

    if (errors.length || needsFallback.length) {
      const savedPath = await writeLlmDebugArtifact(
        input.config,
        "llm-understanding-family-mapping-batch",
        mappingResponse
      );
      const message = errors.length ? errors.join("; ") : "missing batch items";
      log(
        `LLM understanding/family mapping batch parse issues for ${batchItems.length} chunks. ${message}. Saved response: ${savedPath}`
      );
      logDebug(input.debug, {
        event: "llm_understanding_family_mapping_batch_parse_error",
        message,
        savedPath,
        batchSize: batchItems.length,
        missing: needsFallback
      });
    }

    const insights: LlmFileInsight[] = [];
    for (let i = 0; i < batchItems.length; i += 1) {
      const item = batchItems[i];
      const parsed = results[i];
      if (parsed) {
        insights.push(
          buildFileInsight(item.file, item.chunkId, parsed.understanding, parsed.familyMapping)
        );
      } else {
        insights.push(await mapSingleChunk(item.file));
      }
    }

    return insights;
  };

  const fileInsights = (await runWithConcurrency(
    mappingBatches,
    mapConcurrency,
    mapBatch
  )).flat();

  const tasks: RuleScanTask[] = [];
  log("LLM scan (rule diagnosis)...");
  for (const insight of fileInsights) {
    const ruleIdBatches = chunkRuleIds(insight.candidateRuleIds, RULE_BATCH_SIZE);
    for (const ruleIds of ruleIdBatches) {
      const rules = ruleIds
        .map((ruleId) => rulesById.get(ruleId))
        .filter(Boolean) as RuleScanDefinition[];
      if (rules.length === 0) continue;
      const systemPrompt = buildRepositoryRuleBatchSystemPrompt(rules);
      const combinedSystemPrompt = [systemPrompt, systemContext].filter(Boolean).join("\n\n");
      const taskKey = buildRuleBatchTaskKey(ruleIds, insight.file);
      if (resumeResults.has(taskKey)) {
        const stored = resumeResults.get(taskKey);
        if (stored && stored.length > 0) {
          resumedFindings.push(...stored);
        }
        resumedTaskCount += 1;
        continue;
      }
      tasks.push({
        ruleIds,
        file: insight.file,
        systemPrompt: combinedSystemPrompt,
        existingFindings,
        taskKey,
        llmUnderstanding: insight.understanding,
        familyMapping: insight.familyMapping,
        candidateRuleIds: insight.candidateRuleIds
      });
    }
  }

  const openScanTasks: OpenScanTask[] = [];
  for (const insight of fileInsights) {
    const taskKey = buildOpenScanTaskKey(insight.file);
    if (resumeResults.has(taskKey)) {
      const stored = resumeResults.get(taskKey);
      if (stored && stored.length > 0) {
        resumedOpenFindings.push(...stored);
      }
      resumedTaskCount += 1;
      continue;
    }
    openScanTasks.push({
      fileInsight: insight,
      existingFindings,
      taskKey
    });
  }

  if (fileInsights.length > 0) {
    const totalRuleScans = fileInsights.reduce(
      (sum, insight) => sum + insight.candidateRuleIds.length,
      0
    );
    const totalRuleBatches = fileInsights.reduce(
      (sum, insight) => sum + chunkRuleIds(insight.candidateRuleIds, RULE_BATCH_SIZE).length,
      0
    );
    const avgRules = totalRuleScans / fileInsights.length;
    const avgBatches = totalRuleBatches / fileInsights.length;
    const maxRules = fileInsights.reduce(
      (max, insight) => Math.max(max, insight.candidateRuleIds.length),
      0
    );
    log(
      `LLM fanout: chunks=${fileInsights.length}, ruleBatches=${totalRuleBatches}, avgBatchesPerChunk=${avgBatches.toFixed(
        2
      )}, totalRules=${totalRuleScans}, avgRulesPerChunk=${avgRules.toFixed(
        2
      )}, maxRulesPerChunk=${maxRules}, openScans=${openScanTasks.length}`
    );
  }

  await input.resume?.setRuleTaskCount(
    tasks.length + openScanTasks.length + resumedTaskCount
  );

  const results = await runWithConcurrency(tasks, mapConcurrency, async (task) => {
    const { ruleIds, file, existingFindings: existing, taskKey, llmUnderstanding, familyMapping, candidateRuleIds } = task;

    const filePayload = {
      path: file.path,
      startLine: file.startLine,
      endLine: file.endLine,
      chunkIndex: file.chunkIndex,
      truncated: file.truncated ?? false,
      content: file.content,
      llmUnderstanding: llmUnderstanding ?? undefined,
      familyMapping: familyMapping ?? undefined,
      candidateRuleIds: candidateRuleIds.length ? candidateRuleIds : undefined
    };

    const payload = {
      outputSchema,
      repositories: [
        {
          fullName: input.repository.fullName,
          defaultBranch: input.repository.defaultBranch ?? undefined,
          metadata: input.repository.providerMetadata ?? undefined,
          repoPaths: input.repository.repoPaths,
          repoRoles: input.repository.repoRoles,
          existingFindings: existing.length ? existing : undefined,
          files: [filePayload]
        }
      ],
      focus: buildRuleBatchFocus(ruleIds, rulesById)
    };

    const response = await runChatCompletion(input.config, [
      { role: "system", content: task.systemPrompt },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]);

    try {
      const parsed = parseFindings(response, input.repository, {
        requireFilepath: true,
        defaultLocation: {
          filepath: file.path,
          startLine: file.startLine,
          endLine: file.endLine,
          chunkIndex: file.chunkIndex
        }
      });
      const scoped = enforceRuleBatchFindings(parsed, ruleIds);
      const overlapGroupId = file.overlapGroupId ?? null;
      if (overlapGroupId) {
        const adjusted = scoped.map((finding) => ({
          ...finding,
          details: { ...toRecord(finding.details), overlapGroupId }
        }));
        await input.resume?.recordRuleResult(taskKey, adjusted);
        return adjusted;
      }
      await input.resume?.recordRuleResult(taskKey, scoped);
      return scoped;
    } catch (err) {
      const savedPath = await writeLlmDebugArtifact(
        input.config,
        `llm-map-${ruleIds.join("-")}`,
        response
      );
      const message = err instanceof Error ? err.message : String(err);
      log(
        `LLM rule scan parse error (${ruleIds.join(",")}) for ${file.path}:${file.startLine}-${file.endLine}. ${message}. Saved response: ${savedPath}`
      );
      logDebug(input.debug, {
        event: "llm_parse_error",
        ruleIds,
        file: {
          path: file.path,
          chunkIndex: file.chunkIndex,
          startLine: file.startLine,
          endLine: file.endLine,
        },
        message,
        savedPath,
      });
      return [];
    }
  });

  log("LLM scan (open scan)...");
  const openScanResults = await runWithConcurrency(
    openScanTasks,
    mapConcurrency,
    async (task) => {
      const { fileInsight, existingFindings: existing, taskKey } = task;
      const file = fileInsight.file;
      const fallbackFamily =
        pickPrimaryFamilyFromCategories(fileInsight.selectionFamilies) ??
        pickPrimaryFamilyFromMapping(fileInsight.familyMapping);

      const filePayload = {
        path: file.path,
        startLine: file.startLine,
        endLine: file.endLine,
        chunkIndex: file.chunkIndex,
        truncated: file.truncated ?? false,
        content: file.content,
        llmUnderstanding: fileInsight.understanding ?? undefined,
        familyMapping: fileInsight.familyMapping ?? undefined,
        candidateRuleIds: fileInsight.candidateRuleIds.length
          ? fileInsight.candidateRuleIds
          : undefined
      };

      const payload = {
        outputSchema,
        ruleCatalog: ruleCatalogSummary,
        repositories: [
          {
            fullName: input.repository.fullName,
            defaultBranch: input.repository.defaultBranch ?? undefined,
            metadata: input.repository.providerMetadata ?? undefined,
            repoPaths: input.repository.repoPaths,
            repoRoles: input.repository.repoRoles,
            existingFindings: existing.length ? existing : undefined,
            files: [filePayload]
          }
        ],
        focus: "Open scan: issues not covered by rule catalog"
      };

      const response = await runChatCompletion(input.config, [
        { role: "system", content: openScanSystemPrompt },
        { role: "user", content: JSON.stringify(payload, null, 2) }
      ]);

      try {
        const parsed = parseFindings(response, input.repository, {
          requireFilepath: true,
          defaultLocation: {
            filepath: file.path,
            startLine: file.startLine,
            endLine: file.endLine,
            chunkIndex: file.chunkIndex
          }
        });
        const scoped = enforceOpenScanFindings(parsed, {
          ruleIds: ruleIdSet,
          fallbackFamily
        });
        const overlapGroupId = file.overlapGroupId ?? null;
        if (overlapGroupId) {
          const adjusted = scoped.map((finding) => ({
            ...finding,
            details: { ...toRecord(finding.details), overlapGroupId }
          }));
          await input.resume?.recordRuleResult(taskKey, adjusted);
          return adjusted;
        }
        await input.resume?.recordRuleResult(taskKey, scoped);
        return scoped;
      } catch (err) {
        const savedPath = await writeLlmDebugArtifact(
          input.config,
          "llm-open-scan",
          response
        );
        const message = err instanceof Error ? err.message : String(err);
        log(
          `LLM open scan parse error for ${file.path}:${file.startLine}-${file.endLine}. ${message}. Saved response: ${savedPath}`
        );
        logDebug(input.debug, {
          event: "llm_open_scan_parse_error",
          file: {
            path: file.path,
            chunkIndex: file.chunkIndex,
            startLine: file.startLine,
            endLine: file.endLine,
          },
          message,
          savedPath,
        });
        return [];
      }
    }
  );

  const openScanFindings = [
    ...resumedOpenFindings,
    ...openScanResults.flatMap((result) => result)
  ];
  const llmFindings = [
    ...resumedFindings,
    ...results.flatMap((result) => result),
    ...openScanFindings
  ];
  const reduceDebug = input.debug ? { stage: "llm_rule_reduce", log: input.debug.log } : undefined;
  const reduced = reduceRepositoryFindings(llmFindings, reduceDebug);
  return reduced;
}

export async function scanRepositoryComposites(
  input: CompositeScanInput
): Promise<RepositoryScanFinding[]> {
  if (input.files.length === 0) {
    return [];
  }

  const outputSchema = buildRepositoryScanOutputSchema();
  const systemPrompt = buildRepositoryCompositeSystemPrompt();
  const { buildKnowledgeContext } = await import("./knowledgeContext.js");
  const systemContext = buildRepositoryContextPrompt(
    [input.repository],
    undefined,
    buildKnowledgeContext() || undefined
  );
  const combinedSystemPrompt = [systemPrompt, systemContext].filter(Boolean).join("\n\n");

  const existingFindings = pickExistingFindings(
    input.existingFindings,
    DEFAULT_MAX_EXISTING_FINDINGS_PER_REPO
  );
  const priorFindings = pickPriorFindings(
    input.priorFindings,
    DEFAULT_MAX_PRIOR_FINDINGS_PER_REPO
  );

  const payload = {
    outputSchema,
    repositories: [
      {
        fullName: input.repository.fullName,
        defaultBranch: input.repository.defaultBranch ?? undefined,
        metadata: input.repository.providerMetadata ?? undefined,
        repoPaths: input.repository.repoPaths,
        repoRoles: input.repository.repoRoles,
        existingFindings: existingFindings.length ? existingFindings : undefined,
        priorFindings: priorFindings.length ? priorFindings : undefined
      }
    ]
  };

  const response = await runChatCompletion(input.config, [
    { role: "system", content: combinedSystemPrompt },
    { role: "user", content: JSON.stringify(payload, null, 2) }
  ]);

  try {
    const parsed = parseFindings(response, input.repository, { requireFilepath: false });
    return parsed;
  } catch (err) {
    const savedPath = await writeLlmDebugArtifact(
      input.config,
      "llm-composite",
      response
    );
    const message = err instanceof Error ? err.message : String(err);
    logDebug(input.debug, {
      event: "llm_composite_parse_error",
      message,
      savedPath,
    });
    return [];
  }
}

function normalizeMapConcurrency(value?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return DEFAULT_MAP_CONCURRENCY;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  runner: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.trunc(concurrency));
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await runner(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

function enforceRuleFindings(
  findings: RepositoryScanFinding[],
  ruleId: string
): RepositoryScanFinding[] {
  const expectedType = extractFindingIdentityType({ type: ruleId });
  return findings.flatMap((finding) => {
    const details = toRecord(finding.details);
    const actualType = extractFindingIdentityType({ type: finding.type ?? null, details });
    if (actualType && expectedType && actualType !== expectedType) {
      return [];
    }
    return [
      {
        ...finding,
        type: finding.type ?? ruleId,
        details: { ...details, ruleId: details.ruleId ?? ruleId }
      }
    ];
  });
}

function enforceRuleBatchFindings(
  findings: RepositoryScanFinding[],
  ruleIds: string[]
): RepositoryScanFinding[] {
  if (ruleIds.length === 0) return [];
  if (ruleIds.length === 1) {
    return enforceRuleFindings(findings, ruleIds[0]);
  }
  const allowedTypes = new Map<string, string>();
  for (const ruleId of ruleIds) {
    const normalized = extractFindingIdentityType({ type: ruleId });
    if (normalized) {
      allowedTypes.set(normalized, ruleId);
    }
  }
  return findings.flatMap((finding) => {
    const details = toRecord(finding.details);
    const actualType = extractFindingIdentityType({ type: finding.type ?? null, details });
    if (!actualType) {
      return [];
    }
    const canonicalRuleId = allowedTypes.get(actualType);
    if (!canonicalRuleId) {
      return [];
    }
    return [
      {
        ...finding,
        type: canonicalRuleId,
        details: { ...details, ruleId: canonicalRuleId }
      }
    ];
  });
}

function selectRepoPathForFile(filepath: string, repoPaths: string[]): string {
  let match = "";
  for (const path of repoPaths) {
    if (!path) continue;
    if (filepath === path || filepath.startsWith(`${path}/`)) {
      if (path.length > match.length) {
        match = path;
      }
    }
  }
  return match;
}

function normalizeRepoPaths(repoPaths?: string[] | null): string[] {
  if (!repoPaths || repoPaths.length === 0) {
    return [];
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const repoPath of repoPaths) {
    if (typeof repoPath !== "string") continue;
    const cleaned = normalizePath(repoPath);
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    normalized.push(cleaned);
  }
  return normalized;
}

function selectRepoPathForFinding(
  repoPaths: string[],
  filepath: string,
  rawRepoPath: unknown
): string | null {
  if (repoPaths.length === 0) {
    return null;
  }
  if (repoPaths.length === 1) {
    return repoPaths[0];
  }

  if (typeof rawRepoPath === "string") {
    const normalized = normalizePath(rawRepoPath);
    if (normalized && repoPaths.includes(normalized)) {
      return normalized;
    }
  }

  if (filepath) {
    const match = selectRepoPathForFile(filepath, repoPaths);
    return match || null;
  }

  return null;
}

function sanitizeFindingRepoPath(
  location: Record<string, unknown> | null,
  details: Record<string, unknown>,
  repoPaths?: string[] | null
): Record<string, unknown> | null {
  const normalizedRepoPaths = normalizeRepoPaths(repoPaths);
  const rawRepoPath =
    location?.repoPath ??
    (location as any)?.repo_path ??
    details.repoPath ??
    details.repo_path;
  const filepath = typeof location?.filepath === "string" ? location.filepath : "";
  const selectedRepoPath = selectRepoPathForFinding(
    normalizedRepoPaths,
    filepath,
    rawRepoPath
  );

  if (selectedRepoPath) {
    if (location) {
      location.repoPath = selectedRepoPath;
      delete (location as any).repo_path;
    }
    details.repoPath = selectedRepoPath;
    delete (details as any).repo_path;
  } else {
    if (location) {
      delete (location as any).repoPath;
      delete (location as any).repo_path;
    }
    delete (details as any).repoPath;
    delete (details as any).repo_path;
  }

  return location;
}

function parseFindings(
  raw: string,
  repository: RepositoryDescriptor,
  options?: {
    requireFilepath?: boolean;
    defaultLocation?: {
      filepath: string;
      startLine?: number;
      endLine?: number;
      chunkIndex?: number;
    };
  }
): RepositoryScanFinding[] {
  if (!raw) return [];
  const requireFilepath = options?.requireFilepath ?? false;
  const parsed = extractJson(raw);

  const findingsArray: any[] = Array.isArray(parsed?.findings)
    ? parsed.findings
    : Array.isArray(parsed)
      ? parsed
      : [];

  const findings: RepositoryScanFinding[] = [];
  for (const item of findingsArray) {
    const summary = typeof item?.summary === "string" ? item.summary.trim() : "";
    if (!summary) {
      continue;
    }
    const severity = normalizeSeverity(item?.severity);
    const location =
      item?.location && typeof item.location === "object" && !Array.isArray(item.location)
        ? (item.location as Record<string, unknown>)
        : null;
    const mergedLocation = applyLocationFallback(location, options?.defaultLocation);
    const normalizedLocation = normalizeFindingLocation(mergedLocation);
    const filepath =
      typeof normalizedLocation?.filepath === "string" ? normalizedLocation.filepath.trim() : "";
    if (requireFilepath && !filepath) {
      continue;
    }

    const details = toRecord(item?.details);
    const sanitizedLocation = sanitizeFindingRepoPath(
      normalizedLocation,
      details,
      repository.repoPaths
    );
    const type = normalizeFindingType(item?.type ?? details.type ?? details.category);
    const evidence = mergeStringArrays(
      normalizeEvidence(details.evidence),
      normalizeEvidence(item?.evidence)
    );

    // Ensure confidence is always present for LLM findings (used for UI/triage).
    if (typeof details.confidence !== "string" || !details.confidence.trim()) {
      details.confidence = evidence.length > 0 ? "medium" : "low";
    }

    if (repository.fullName && !details.repositoryFullName) {
      details.repositoryFullName = repository.fullName;
    }
    if (evidence.length > 0 && (!details.evidence || typeof details.evidence === "string" || Array.isArray(details.evidence))) {
      details.evidence = evidence;
    }

    findings.push({
      repositoryFullName: repository.fullName,
      type: type ?? undefined,
      severity,
      summary,
      evidence: evidence.length > 0 ? evidence : undefined,
      details,
      location: sanitizedLocation
    });
  }
  return findings;
}

function extractJson(raw: string): any {
  const text = raw.trim();
  if (!text) {
    return {};
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return safeParseJson(fenced[1].trim());
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return safeParseJson(text.slice(firstBrace, lastBrace + 1));
  }

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return safeParseJson(text.slice(firstBracket, lastBracket + 1));
  }

  return safeParseJson(text);
}

function safeParseJson(raw: string): any {
  const cleaned = stripJsonComments(raw);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const recovered = recoverFindingsArray(cleaned);
    if (recovered) {
      return recovered;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM returned invalid JSON: ${message}`);
  }
}

function recoverFindingsArray(raw: string): any[] | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  // Recover complete objects from a truncated findings array.
  let inString = false;
  let escape = false;
  let arrayStarted = false;
  let objectDepth = 0;
  let objectStart = -1;
  const recovered: any[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }

    if (!arrayStarted) {
      if (char === "[") {
        arrayStarted = true;
      }
      continue;
    }

    if (char === "{") {
      if (objectDepth === 0) {
        objectStart = i;
      }
      objectDepth += 1;
      continue;
    }

    if (char === "}") {
      if (objectDepth > 0) {
        objectDepth -= 1;
        if (objectDepth === 0 && objectStart !== -1) {
          const candidate = text.slice(objectStart, i + 1).trim();
          if (candidate) {
            try {
              recovered.push(JSON.parse(candidate));
            } catch {
              // Ignore malformed objects and keep earlier recovered findings.
            }
          }
          objectStart = -1;
        }
      }
      continue;
    }

    if (char === "]" && objectDepth === 0) {
      break;
    }
  }

  return recovered.length ? recovered : null;
}

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? "";
    const next = input[i + 1] ?? "";
    if (!inString && char === "/" && next === "/") {
      i += 1;
      while (i + 1 < input.length && input[i + 1] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (!inString && char === "/" && next === "*") {
      i += 1;
      while (i + 1 < input.length) {
        if (input[i] === "*" && input[i + 1] === "/") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    output += char;
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
    }
  }
  return output;
}

function normalizeConfidence(value: unknown): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.min(1, Math.max(0, numeric));
}

function coerceStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const next: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (trimmed) next.push(trimmed);
  }
  return next;
}

function parseSignals(value: unknown): LlmChunkUnderstandingSignal[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("signals must be an array.");
  }
  const results: LlmChunkUnderstandingSignal[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("signals entries must be objects.");
    }
    const record = entry as Record<string, unknown>;
    const rawId = typeof record.id === "string" ? record.id.trim() : "";
    if (!rawId || !SIGNAL_ID_SET.has(rawId as SignalId)) {
      throw new Error(`Invalid signal id: ${rawId || "unknown"}.`);
    }
    const evidence = typeof record.evidence === "string" ? record.evidence.trim() : "";
    if (!evidence) {
      throw new Error(`Signal evidence missing for ${rawId}.`);
    }
    results.push({
      id: rawId as SignalId,
      evidence,
      confidence: normalizeConfidence(record.confidence)
    });
  }
  return results;
}

function parseIdentifiers(value: unknown): LlmChunkUnderstandingIdentifier[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error("identifiers must be an array.");
  }
  const results: LlmChunkUnderstandingIdentifier[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error("identifiers entries must be objects.");
    }
    const record = entry as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) {
      throw new Error("identifiers.name must be a non-empty string.");
    }
    const kind = typeof record.kind === "string" ? record.kind.trim().toLowerCase() : "";
    if (!IDENTIFIER_KINDS.has(kind as LlmChunkUnderstandingIdentifier["kind"])) {
      throw new Error(`Invalid identifier kind: ${kind || "unknown"}.`);
    }
    const source = typeof record.source === "string" ? record.source.trim() : "";
    if (!source) {
      throw new Error(`identifiers.source missing for ${name}.`);
    }
    const trust = typeof record.trust === "string" ? record.trust.trim().toLowerCase() : "";
    if (!IDENTIFIER_TRUST_LEVELS.has(trust as LlmChunkUnderstandingIdentifier["trust"])) {
      throw new Error(`Invalid identifier trust: ${trust || "unknown"}.`);
    }
    results.push({
      name,
      kind: kind as LlmChunkUnderstandingIdentifier["kind"],
      source,
      trust: trust as LlmChunkUnderstandingIdentifier["trust"]
    });
  }
  return results;
}

function applyDerivedSignals(understanding: LlmChunkUnderstanding): void {
  const signals = understanding.signals ?? [];
  const seen = new Set<SignalId>(signals.map((signal) => signal.id));
  const addSignal = (id: SignalId, evidence: string, confidence = 0.8) => {
    if (seen.has(id)) return;
    signals.push({ id, evidence, confidence });
    seen.add(id);
  };

  const exposure =
    typeof understanding.exposure === "string" ? understanding.exposure.trim().toLowerCase() : "";
  if (exposure === "public") {
    addSignal("public_entrypoint", "exposure marked public", 0.85);
  }

  const role = typeof understanding.role === "string" ? understanding.role.trim().toLowerCase() : "";
  if (role === "api_handler") {
    addSignal("api_handler", "role indicates API handler", 0.8);
  }

  const dataSinks = Array.isArray(understanding.data_sinks) ? understanding.data_sinks : [];
  const hasExecSink = dataSinks.some((sink) => {
    if (!sink || typeof sink !== "object" || Array.isArray(sink)) return false;
    const sinkRecord = sink as Record<string, unknown>;
    const type = typeof sinkRecord.type === "string" ? sinkRecord.type.trim().toLowerCase() : "";
    return type === "exec";
  });
  if (hasExecSink) {
    addSignal("exec_sink", "data_sinks includes exec", 0.9);
  }

  const dataInputs = Array.isArray(understanding.data_inputs) ? understanding.data_inputs : [];
  const hasUntrustedInput = dataInputs.some((input) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return false;
    const inputRecord = input as Record<string, unknown>;
    const trust = typeof inputRecord.trust === "string" ? inputRecord.trust.trim().toLowerCase() : "";
    return trust === "untrusted";
  });
  if (hasUntrustedInput) {
    addSignal("untrusted_input_present", "data_inputs include untrusted sources", 0.85);
  }

  understanding.signals = signals;
}

export function parseChunkUnderstandingRecord(
  record: Record<string, unknown>,
  fallback: { chunkId: string; filePath: string }
): LlmChunkUnderstanding {
  const chunkId =
    typeof record.chunk_id === "string" && record.chunk_id.trim()
      ? record.chunk_id.trim()
      : fallback.chunkId;
  const filePath =
    typeof record.file_path === "string" && record.file_path.trim()
      ? record.file_path.trim()
      : fallback.filePath;
  const confidence = normalizeConfidence(record.confidence);
  const signals = parseSignals(record.signals);
  const identifiers = parseIdentifiers(record.identifiers);
  const understanding: LlmChunkUnderstanding = {
    ...record,
    chunk_id: chunkId,
    file_path: filePath,
    confidence,
    signals,
    identifiers
  };
  applyDerivedSignals(understanding);
  return understanding;
}

function parseFamilyMappingRecord(
  record: Record<string, unknown>,
  fallback: { chunkId: string }
): LlmFamilyMapping {
  const chunkId =
    typeof record.chunk_id === "string" && record.chunk_id.trim()
      ? record.chunk_id.trim()
      : fallback.chunkId;
  const candidateRaw = Array.isArray(record.families) ? record.families : [];
  const families: LlmFamilyCandidate[] = [];
  for (const item of candidateRaw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    const family = typeof entry.family === "string" ? entry.family.trim().toLowerCase() : "";
    if (!family) continue;
    families.push({
      family,
      confidence: normalizeConfidence(entry.confidence),
      rationale: typeof entry.rationale === "string" ? entry.rationale.trim() : undefined
    });
  }
  const needsMoreContext = coerceStringArray(record.needs_more_context);
  const suggestedRuleIdsRaw =
    Array.isArray(record.suggested_rule_ids) ? record.suggested_rule_ids :
    Array.isArray(record.suggestedRuleIds) ? record.suggestedRuleIds :
    Array.isArray(record.suggested_rules) ? record.suggested_rules :
    Array.isArray(record.suggestedRules) ? record.suggestedRules :
    [];
  const suggestedRuleIds = coerceStringArray(suggestedRuleIdsRaw).slice(0, 5);
  return {
    ...record,
    chunk_id: chunkId,
    families,
    suggested_rule_ids: suggestedRuleIds.length ? suggestedRuleIds : undefined,
    needs_more_context: needsMoreContext
  };
}

function parseChunkUnderstanding(
  raw: string,
  fallback: { chunkId: string; filePath: string }
): LlmChunkUnderstanding {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM returned invalid JSON for chunk understanding.");
  }
  return parseChunkUnderstandingRecord(parsed as Record<string, unknown>, fallback);
}

function parseFamilyMapping(
  raw: string,
  fallback: { chunkId: string }
): LlmFamilyMapping {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM returned invalid JSON for family mapping.");
  }
  return parseFamilyMappingRecord(parsed as Record<string, unknown>, fallback);
}

function parseUnderstandingAndFamilyMapping(
  raw: string,
  fallback: { chunkId: string; filePath: string }
): { understanding: LlmChunkUnderstanding | null; familyMapping: LlmFamilyMapping | null } {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("LLM returned invalid JSON for understanding+family mapping.");
  }
  return parseUnderstandingAndFamilyMappingRecord(parsed as Record<string, unknown>, fallback);
}

function parseUnderstandingAndFamilyMappingRecord(
  record: Record<string, unknown>,
  fallback: { chunkId: string; filePath: string }
): { understanding: LlmChunkUnderstanding; familyMapping: LlmFamilyMapping } {
  const understandingRaw = record.chunk_understanding;
  const familyRaw = record.family_mapping;

  if (!understandingRaw || typeof understandingRaw !== "object" || Array.isArray(understandingRaw)) {
    throw new Error("Missing chunk_understanding object.");
  }
  if (!familyRaw || typeof familyRaw !== "object" || Array.isArray(familyRaw)) {
    throw new Error("Missing family_mapping object.");
  }

  const understanding = parseChunkUnderstandingRecord(
    understandingRaw as Record<string, unknown>,
    fallback
  );
  const familyMapping = parseFamilyMappingRecord(
    familyRaw as Record<string, unknown>,
    { chunkId: understanding.chunk_id || fallback.chunkId }
  );

  // Ensure identifiers are consistent.
  familyMapping.chunk_id = understanding.chunk_id;

  return { understanding, familyMapping };
}

function parseUnderstandingAndFamilyMappingBatch(
  raw: string,
  fallbacks: Array<{ chunkId: string; filePath: string }>
): { results: Array<{ understanding: LlmChunkUnderstanding; familyMapping: LlmFamilyMapping } | null>; errors: string[] } {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("LLM returned invalid JSON for understanding+family mapping batch.");
  }

  const records = Array.isArray(parsed) ? parsed : [parsed];
  const results = new Array(fallbacks.length).fill(null) as Array<
    { understanding: LlmChunkUnderstanding; familyMapping: LlmFamilyMapping } | null
  >;
  const errors: string[] = [];

  const limit = Math.min(records.length, fallbacks.length);
  for (let i = 0; i < limit; i += 1) {
    const record = records[i];
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`index ${i}: invalid record`);
      continue;
    }
    try {
      results[i] = parseUnderstandingAndFamilyMappingRecord(
        record as Record<string, unknown>,
        fallbacks[i]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`index ${i}: ${message}`);
    }
  }

  if (records.length !== fallbacks.length) {
    errors.push(`expected ${fallbacks.length} results, got ${records.length}`);
  }

  return { results, errors };
}

function extractSignalIds(understanding: LlmChunkUnderstanding | null): SignalId[] {
  if (!understanding?.signals?.length) return [];
  const ids: SignalId[] = [];
  for (const signal of understanding.signals) {
    if (!signal || typeof signal !== "object") continue;
    const id = typeof signal.id === "string" ? signal.id.trim() : "";
    if (!id || !SIGNAL_ID_SET.has(id as SignalId)) continue;
    ids.push(id as SignalId);
  }
  return ids;
}

function countMatchedSignals(list: SignalId[] | undefined, signalSet: Set<SignalId>): number {
  if (!list || list.length === 0) return 0;
  let count = 0;
  for (const signal of list) {
    if (signalSet.has(signal)) count += 1;
  }
  return count;
}

function isRuleEligibleBySignals(rule: RuleScanDefinition, signalSet: Set<SignalId>): boolean {
  const requiredAll = rule.requiredAllSignals ?? [];
  if (requiredAll.length > 0) {
    for (const signal of requiredAll) {
      if (!signalSet.has(signal)) return false;
    }
  }
  const requiredAny = rule.requiredAnySignals ?? [];
  if (requiredAny.length > 0 && countMatchedSignals(requiredAny, signalSet) === 0) {
    return false;
  }
  return true;
}

function scoreRuleBySignals(
  rule: RuleScanDefinition,
  signalSet: Set<SignalId>,
  understanding: LlmChunkUnderstanding
): number {
  const requiredAll = rule.requiredAllSignals ?? [];
  const requiredAny = rule.requiredAnySignals ?? [];
  const optional = rule.optionalSignals ?? [];
  let score = 0;

  if (requiredAll.length > 0) {
    score += 3 * countMatchedSignals(requiredAll, signalSet);
  }

  if (requiredAny.length > 0 && countMatchedSignals(requiredAny, signalSet) > 0) {
    score += 2;
  }

  score += countMatchedSignals(optional, signalSet);

  const exposure = typeof understanding.exposure === "string"
    ? understanding.exposure.trim().toLowerCase()
    : "";
  if (exposure === "public") {
    score += 0.25;
  }

  const role = typeof understanding.role === "string"
    ? understanding.role.trim().toLowerCase()
    : "";
  if (role === "api_handler") {
    score += 0.15;
  } else if (role === "job_worker") {
    score += 0.1;
  }

  return score;
}

function deriveSelectionFamilies(
  ruleIds: string[],
  rulesById: Map<string, RuleScanDefinition>
): string[] {
  const families: string[] = [];
  const seen = new Set<string>();
  for (const ruleId of ruleIds) {
    const rule = rulesById.get(ruleId);
    if (!rule) continue;
    const family = normalizeFamilyToken(rule.category);
    if (!family || seen.has(family)) continue;
    seen.add(family);
    families.push(family);
  }
  return families;
}

export function resolveCandidateRuleIds(params: {
  understanding: LlmChunkUnderstanding | null;
  familyMapping: LlmFamilyMapping | null;
  rulesById: Map<string, RuleScanDefinition>;
  fallbackRuleIds: string[];
}): {
  ruleIds: string[];
  families: string[];
  strategy: "signals_primary" | "role_fallback" | "baseline_fallback";
} {
  const { understanding, familyMapping, rulesById, fallbackRuleIds } = params;
  const filteredFallback = fallbackRuleIds.filter((ruleId) => rulesById.has(ruleId));
  if (!understanding) {
    return {
      ruleIds: filteredFallback.slice(0, MAX_RULES_PER_CHUNK),
      families: [],
      strategy: "baseline_fallback"
    };
  }

  const signalIds = extractSignalIds(understanding);
  const signalSet = new Set<SignalId>(signalIds);
  const scoredRules: Array<{ id: string; score: number }> = [];
  if (signalSet.size > 0) {
    for (const rule of rulesById.values()) {
      if (!isRuleEligibleBySignals(rule, signalSet)) continue;
      const score = scoreRuleBySignals(rule, signalSet, understanding);
      scoredRules.push({ id: rule.id, score });
    }
  }
  scoredRules.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.id.localeCompare(b.id);
  });

  const selected: string[] = [];
  const seen = new Set<string>();
  for (const entry of scoredRules) {
    if (selected.length >= MAX_RULES_PER_CHUNK) break;
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    selected.push(entry.id);
  }

  const suggestedRuleIds = (familyMapping?.suggested_rule_ids ?? []).filter(Boolean);
  for (const ruleId of suggestedRuleIds) {
    if (selected.length >= MAX_RULES_PER_CHUNK) break;
    if (!rulesById.has(ruleId) || seen.has(ruleId)) continue;
    seen.add(ruleId);
    selected.push(ruleId);
  }

  let strategy: "signals_primary" | "role_fallback" | "baseline_fallback" = "signals_primary";

  if (signalSet.size === 0 || selected.length < MIN_RULES_PER_CHUNK) {
    const role =
      typeof understanding.role === "string"
        ? understanding.role.trim()
        : "unknown";
    const fallbackFamilies = ROLE_FAMILY_FALLBACKS[role] ?? ROLE_FAMILY_FALLBACKS.unknown;
    strategy = "role_fallback";

    for (const family of fallbackFamilies) {
      const ruleIds = FAMILY_RULES[family] ?? [];
      for (const ruleId of ruleIds) {
        if (selected.length >= MAX_RULES_PER_CHUNK) break;
        if (!rulesById.has(ruleId) || seen.has(ruleId)) continue;
        seen.add(ruleId);
        selected.push(ruleId);
      }
      if (selected.length >= MAX_RULES_PER_CHUNK) break;
    }

    if (selected.length === 0) {
      strategy = "baseline_fallback";
      for (const ruleId of filteredFallback) {
        if (selected.length >= MAX_RULES_PER_CHUNK) break;
        if (seen.has(ruleId)) continue;
        seen.add(ruleId);
        selected.push(ruleId);
      }
    }
  }

  return {
    ruleIds: selected,
    families: deriveSelectionFamilies(selected, rulesById),
    strategy
  };
}

function normalizeFamilyToken(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function pickPrimaryFamilyFromMapping(mapping: LlmFamilyMapping | null): string | null {
  if (!mapping?.families?.length) return null;
  let best = mapping.families[0];
  for (const entry of mapping.families) {
    if (normalizeConfidence(entry.confidence) > normalizeConfidence(best.confidence)) {
      best = entry;
    }
  }
  const family = normalizeFamilyToken(best.family);
  return OPEN_SCAN_FAMILIES.has(family) ? family : null;
}

function pickPrimaryFamilyFromCategories(families: string[]): string | null {
  for (const family of families) {
    const normalized = normalizeFamilyToken(family);
    if (normalized && OPEN_SCAN_FAMILIES.has(normalized)) {
      return normalized;
    }
  }
  return null;
}

function resolveOpenScanFamily(
  details: Record<string, unknown>,
  fallbackFamily: string | null
): string | null {
  const candidates = [
    details.family,
    details.findingFamily,
    details.finding_family,
    details.category
  ];
  for (const candidate of candidates) {
    const normalized = normalizeFamilyToken(candidate);
    if (normalized && OPEN_SCAN_FAMILIES.has(normalized)) {
      return normalized;
    }
  }
  if (fallbackFamily && OPEN_SCAN_FAMILIES.has(fallbackFamily)) {
    return fallbackFamily;
  }
  return null;
}

function extractRuleIdToken(details: Record<string, unknown>): string {
  const candidates = [
    details.ruleId,
    details.rule_id,
    details.ruleID,
    details.findingType,
    details.finding_type
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

function enforceOpenScanFindings(
  findings: RepositoryScanFinding[],
  params: { ruleIds: Set<string>; fallbackFamily: string | null }
): RepositoryScanFinding[] {
  const { ruleIds, fallbackFamily } = params;
  return findings.flatMap((finding) => {
    const details = toRecord(finding.details);
    const ruleId = extractRuleIdToken(details);
    if (ruleId && ruleIds.has(ruleId)) {
      return [];
    }
    const typeValue = typeof finding.type === "string" ? finding.type.trim() : "";
    if (typeValue && ruleIds.has(typeValue)) {
      return [];
    }
    const family = resolveOpenScanFamily(details, fallbackFamily);
    const whyRaw =
      typeof details.whyNotCoveredByRules === "string"
        ? details.whyNotCoveredByRules.trim()
        : "";
    const whyAlt =
      typeof details.why_not_covered_by_rules === "string"
        ? details.why_not_covered_by_rules.trim()
        : "";
    const whyNotCoveredByRules = whyRaw || whyAlt;
    const nextDetails: Record<string, unknown> = {
      ...details,
      openScan: true,
      family: family ?? undefined
    };
    if (whyNotCoveredByRules) {
      nextDetails.whyNotCoveredByRules = whyNotCoveredByRules;
      delete nextDetails.why_not_covered_by_rules;
    }
    return [
      {
        ...finding,
        type: family ? `open_scan_${family}` : "open_scan",
        details: nextDetails
      }
    ];
  });
}

function applyLocationFallback(
  location: Record<string, unknown> | null,
  fallback?: {
    filepath: string;
    startLine?: number;
    endLine?: number;
    chunkIndex?: number;
  }
): Record<string, unknown> | null {
  if (!fallback) {
    return location;
  }
  const merged: Record<string, unknown> = { ...(location ?? {}) };
  // Always prefer the sampled file path; ignore any LLM-provided filepath.
  merged.filepath = normalizePath(fallback.filepath);
  if (!hasLocationLineInfo(merged) && typeof fallback.startLine === "number") {
    merged.startLine = fallback.startLine;
  }
  if (merged.chunkIndex == null && typeof fallback.chunkIndex === "number") {
    merged.chunkIndex = fallback.chunkIndex;
  }
  return merged;
}

function hasLocationFilepath(location: Record<string, unknown>): boolean {
  const raw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (isPlaceholderPath(trimmed)) return false;
  return true;
}

function isPlaceholderPath(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("path/to/") ||
    lower.includes("path\\to\\") ||
    lower.includes("placeholder")
  );
}

function hasLocationLineInfo(location: Record<string, unknown>): boolean {
  return (
    normalizeLineNumber(location.startLine ?? location.start_line ?? location.line ?? location.start) !== null ||
    normalizeLineNumber(location.endLine ?? location.end_line ?? location.lineEnd ?? location.end) !== null
  );
}

function normalizeFindingLocation(
  location: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!location) return null;
  const normalized: Record<string, unknown> = { ...location };

  const filepathRaw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  const filepath = typeof filepathRaw === "string" ? normalizePath(filepathRaw) : "";

  if (filepath && !isPlaceholderPath(filepath)) {
    normalized.filepath = filepath;
  } else {
    delete normalized.filepath;
  }

  const startLine = normalizeLineNumber(
    location.startLine ?? location.start_line ?? location.line ?? location.start
  );
  const endLine = normalizeLineNumber(
    location.endLine ?? location.end_line ?? location.lineEnd ?? location.end
  );
  const normalizedStart = startLine ?? endLine ?? null;
  let normalizedEnd = endLine ?? normalizedStart;
  if (normalizedStart !== null && normalizedEnd !== null && normalizedEnd < normalizedStart) {
    normalizedEnd = normalizedStart;
  }
  if (normalizedStart !== null) {
    normalized.startLine = normalizedStart;
  } else {
    delete normalized.startLine;
  }
  if (normalizedEnd !== null) {
    normalized.endLine = normalizedEnd;
  } else {
    delete normalized.endLine;
  }

  const chunkIndex = normalizeChunkIndex(location.chunkIndex ?? (location as any).chunk_index);
  if (chunkIndex !== null) {
    normalized.chunkIndex = chunkIndex;
  } else {
    delete normalized.chunkIndex;
  }

  delete (normalized as any).filePath;
  delete (normalized as any).path;
  delete (normalized as any).file;
  delete (normalized as any).start_line;
  delete (normalized as any).line;
  delete (normalized as any).start;
  delete (normalized as any).end_line;
  delete (normalized as any).lineEnd;
  delete (normalized as any).end;
  delete (normalized as any).chunk_index;

  return normalized;
}

function logDebug(debug: DedupeDebug | undefined, event: Record<string, unknown>): void {
  if (!debug) return;
  debug.log({ stage: debug.stage, ...event });
}

function normalizeTypeToken(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeMergeIdentityToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return normalizeTypeToken(trimmed);
}

function normalizeEntryPointIdentity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function extractRuleIdForMerge(finding: RepositoryScanFinding): string {
  const details = toRecord(finding.details);
  const ruleId =
    details.ruleId ??
    details.rule_id ??
    details.ruleID ??
    details.findingType ??
    details.finding_type ??
    null;
  return normalizeMergeIdentityToken(ruleId);
}

function extractCandidateTypeForMerge(finding: RepositoryScanFinding): string {
  const details = toRecord(finding.details);
  const candidateType = details.candidateType ?? details.candidate_type ?? null;
  return normalizeMergeIdentityToken(candidateType);
}

function extractEntryPointForMerge(finding: RepositoryScanFinding): string {
  const details = toRecord(finding.details);
  const candidates = [
    details.entryPoint,
    details.entry_point,
    details.entryPointIdentifier,
    details.entry_point_identifier,
    details.entryPointId,
    details.entry_point_id,
    details.primarySymbol,
    details.primary_symbol
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    return normalizeEntryPointIdentity(trimmed);
  }
  return "";
}

function extractEntryPointFromDetails(details: Record<string, unknown>): string {
  const candidates = [
    details.entryPoint,
    details.entry_point,
    details.entryPointIdentifier,
    details.entry_point_identifier,
    details.entryPointId,
    details.entry_point_id,
    details.primarySymbol,
    details.primary_symbol
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    return normalizeEntryPointIdentity(trimmed);
  }
  return "";
}

function shouldMergeRepositoryFindings(
  left: RepositoryScanFinding,
  right: RepositoryScanFinding
): { merge: boolean; reason?: string } {
  const leftRuleId = extractRuleIdForMerge(left);
  const rightRuleId = extractRuleIdForMerge(right);
  if (leftRuleId && rightRuleId && leftRuleId !== rightRuleId) {
    return { merge: false, reason: "rule_id_mismatch" };
  }
  const leftCandidateType = extractCandidateTypeForMerge(left);
  const rightCandidateType = extractCandidateTypeForMerge(right);
  if (leftCandidateType && rightCandidateType && leftCandidateType !== rightCandidateType) {
    return { merge: false, reason: "candidate_type_mismatch" };
  }
  const leftIdentity = leftRuleId || leftCandidateType;
  const rightIdentity = rightRuleId || rightCandidateType;
  if (leftIdentity && rightIdentity && leftIdentity !== rightIdentity) {
    return { merge: false, reason: "identity_mismatch" };
  }
  const leftEntryPoint = extractEntryPointForMerge(left);
  const rightEntryPoint = extractEntryPointForMerge(right);
  if (leftEntryPoint && rightEntryPoint && leftEntryPoint !== rightEntryPoint) {
    return { merge: false, reason: "entry_point_mismatch" };
  }
  return { merge: true };
}

function buildRepositoryDebugFinding(finding: RepositoryScanFinding): Record<string, unknown> {
  const details = toRecord(finding.details);
  const location = toRecord(finding.location);
  const filepathRaw = location.filepath ?? location.filePath ?? location.path ?? location.file;
  const filepath = typeof filepathRaw === "string" ? filepathRaw : "";
  const startLine = normalizeLineNumber(
    location.startLine ?? location.start_line ?? location.line ?? location.start
  );
  const endLine = normalizeLineNumber(
    location.endLine ?? location.end_line ?? location.lineEnd ?? location.end
  );
  const chunkIndex = normalizeChunkIndex(location.chunkIndex ?? (location as any).chunk_index);
  const categoryRaw =
    details.category ?? details.findingCategory ?? details.finding_category ?? null;
  const category = typeof categoryRaw === "string" ? categoryRaw.trim() : null;
  const sourceRaw = details.source ?? null;
  const source = typeof sourceRaw === "string" ? sourceRaw.trim() : null;
  const identityType = extractFindingIdentityType({
    summary: finding.summary,
    type: finding.type ?? null,
    category,
    source,
    location: finding.location ?? null,
    details: finding.details ?? null
  });
  const ruleId =
    details.ruleId ??
    details.rule_id ??
    details.ruleID ??
    details.findingType ??
    details.finding_type ??
    null;
  const candidateType = details.candidateType ?? details.candidate_type ?? null;
  const entryPoint = extractEntryPointForMerge(finding);

  return {
    summary: finding.summary,
    severity: finding.severity,
    type: finding.type ?? null,
    identityType: identityType || null,
    ruleId: typeof ruleId === "string" ? ruleId.trim() : null,
    candidateType: typeof candidateType === "string" ? candidateType.trim() : null,
    entryPoint: entryPoint || null,
    dedupeKey: buildFindingIdentityKey(finding) || null,
    repositoryFullName: finding.repositoryFullName ?? null,
    location: {
      filepath: filepath || null,
      startLine,
      endLine,
      chunkIndex
    }
  };
}

export function reduceRepositoryFindings(
  findings: RepositoryScanFinding[],
  debug?: DedupeDebug
): RepositoryScanFinding[] {
  if (findings.length === 0) {
    return [];
  }

  const deduped = new Map<string, RepositoryScanFinding>();
  const passthrough: RepositoryScanFinding[] = [];

  for (const finding of findings) {
    const fingerprint = repositoryFindingFingerprint(finding);
    if (!fingerprint) {
      passthrough.push(finding);
      continue;
    }
    const existing = deduped.get(fingerprint);
    if (!existing) {
      deduped.set(fingerprint, finding);
      continue;
    }
    const decision = shouldMergeRepositoryFindings(existing, finding);
    if (!decision.merge) {
      if (debug) {
        logDebug(debug, {
          event: "merge_reduce_skip",
          fingerprint,
          reason: decision.reason ?? "mismatch",
          left: buildRepositoryDebugFinding(existing),
          right: buildRepositoryDebugFinding(finding)
        });
      }
      passthrough.push(finding);
      continue;
    }
    const merged = mergeRepositoryFindings(existing, finding);
    if (debug) {
      logDebug(debug, {
        event: "merge_reduce",
        fingerprint,
        left: buildRepositoryDebugFinding(existing),
        right: buildRepositoryDebugFinding(finding),
        merged: buildRepositoryDebugFinding(merged)
      });
    }
    deduped.set(fingerprint, merged);
  }

  const combined = [...deduped.values(), ...passthrough];
  combined.sort(compareFindingsBySeverity);
  return combined;
}

function repositoryFindingFingerprint(finding: RepositoryScanFinding): string | null {
  const key = buildFindingIdentityKey(finding);
  return key || null;
}

function mergeRepositoryFindings(
  left: RepositoryScanFinding,
  right: RepositoryScanFinding
): RepositoryScanFinding {
  const leftRank = severityRank(left.severity);
  const rightRank = severityRank(right.severity);
  const winner = rightRank > leftRank ? right : left;
  const loser = winner === right ? left : right;
  const winnerDetails = toRecord(winner.details);
  const loserDetails = toRecord(loser.details);
  const mergedDetails = {
    ...loserDetails,
    ...winnerDetails
  } as Record<string, unknown>;

  const mergedEvidence = mergeStringArrays(
    toStringArray(loser.evidence),
    toStringArray(winner.evidence),
    toStringArray(mergedDetails.evidence)
  );
  if (mergedEvidence.length > 0 && (!mergedDetails.evidence || typeof mergedDetails.evidence === "string" || Array.isArray(mergedDetails.evidence))) {
    mergedDetails.evidence = mergedEvidence;
  }

  return {
    repositoryFullName: winner.repositoryFullName ?? loser.repositoryFullName,
    type: winner.type ?? loser.type ?? null,
    severity: winner.severity,
    summary: winner.summary,
    evidence: mergedEvidence.length > 0 ? mergedEvidence : winner.evidence ?? loser.evidence,
    details: mergedDetails,
    location: mergeFindingLocation(winner.location, loser.location)
  };
}

function mergeFindingLocation(
  primary?: Record<string, unknown> | null,
  secondary?: Record<string, unknown> | null
): Record<string, unknown> | null {
  const primaryRecord = toRecord(primary);
  const secondaryRecord = toRecord(secondary);
  const merged = { ...secondaryRecord, ...primaryRecord };
  return Object.keys(merged).length > 0 ? merged : null;
}

function compareFindingsBySeverity(a: RepositoryScanFinding, b: RepositoryScanFinding): number {
  const rankDiff = severityRank(b.severity) - severityRank(a.severity);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  const summaryDiff = (a.summary ?? "").localeCompare(b.summary ?? "");
  if (summaryDiff !== 0) {
    return summaryDiff;
  }
  const pathDiff = extractFindingPath(a).localeCompare(extractFindingPath(b));
  if (pathDiff !== 0) {
    return pathDiff;
  }
  return normalizeFindingTypeKey(a).localeCompare(normalizeFindingTypeKey(b));
}

function extractFindingPath(finding: RepositoryScanFinding): string {
  const location = toRecord(finding.location);
  const filepathRaw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  return typeof filepathRaw === "string" ? normalizePath(filepathRaw) : "";
}

function extractExistingFindingPath(finding: ExistingScanFinding): string {
  const location = toRecord(finding.location);
  const raw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  return typeof raw === "string" ? normalizePath(raw) : "";
}

function normalizeFindingType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeFindingTypeKey(finding: RepositoryScanFinding): string {
  return extractFindingIdentityType(finding);
}

function normalizeFindingTypeKeyFromValues(typeValue: unknown, details: Record<string, unknown>): string {
  return extractFindingIdentityType({
    type: typeof typeValue === "string" ? typeValue : null,
    details
  });
}

function normalizeSeverity(value: unknown): Severity {
  const str = typeof value === "string" ? value.toLowerCase() : "";
  switch (str) {
    case "critical":
    case "sev0":
    case "p0":
      return "critical";
    case "high":
    case "sev1":
    case "p1":
      return "high";
    case "low":
    case "sev3":
    case "p3":
    case "minor":
    case "info":
    case "informational":
    case "note":
      return str === "info" || str === "informational" || str === "note" ? "info" : "low";
    case "medium":
    case "moderate":
    case "sev2":
    case "p2":
    default:
      return "medium";
  }
}

function severityRank(value: unknown): number {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  switch (normalized) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

function normalizeLineNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const num = Math.trunc(value);
    return num > 0 ? num : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      const num = Math.trunc(parsed);
      return num > 0 ? num : null;
    }
  }
  return null;
}

function normalizeChunkIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function normalizeEvidence(value: unknown): string[] {
  return toStringArray(value);
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

function mergeStringArrays(...lists: string[][]): string[] {
  const merged = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      const trimmed = item.trim();
      if (trimmed) {
        merged.add(trimmed);
      }
    }
  }
  return Array.from(merged);
}

function pickExistingFindings(findings: ExistingScanFinding[], maxFindings: number): ExistingScanFinding[] {
  if (maxFindings <= 0) {
    return [];
  }

  const candidates: ExistingScanFinding[] = [];
  const byFingerprint = new Set<string>();
  for (const finding of findings) {
    const fingerprint = existingFindingFingerprint(finding);
    if (!fingerprint || byFingerprint.has(fingerprint)) {
      continue;
    }
    byFingerprint.add(fingerprint);
    candidates.push(finding);
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return candidates.slice(0, maxFindings).map((finding) => sanitizeExistingFinding(finding));
}

function existingFindingFingerprint(finding: ExistingScanFinding): string {
  return buildFindingIdentityKey(finding) || "";
}

function sanitizeExistingFinding(finding: ExistingScanFinding): ExistingScanFinding {
  const location = toRecord(finding.location);
  const details = toRecord(finding.details);

  const filepathRaw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  const filepath = typeof filepathRaw === "string" ? normalizePath(filepathRaw) : null;

  const startLine = normalizeLineNumber(location.startLine ?? location.start_line ?? location.line);
  const endLine = normalizeLineNumber(location.endLine ?? location.end_line ?? location.lineEnd ?? location.end);

  const tool = typeof details.tool === "string" ? details.tool : null;
  const ruleId = typeof details.ruleId === "string" ? details.ruleId : null;
  const safeDetails = tool || ruleId ? { ...(tool ? { tool } : {}), ...(ruleId ? { ruleId } : {}) } : null;

  return {
    type: typeof finding.type === "string" ? finding.type : null,
    source: typeof finding.source === "string" ? finding.source : null,
    severity: finding.severity ?? null,
    summary: finding.summary,
    location: filepath || startLine || endLine ? { filepath, startLine, endLine } : null,
    details: safeDetails
  };
}

function pickPriorFindings(findings: RepositoryScanFinding[], maxFindings: number): RepositoryScanFinding[] {
  if (maxFindings <= 0) {
    return [];
  }

  const candidates: RepositoryScanFinding[] = [];
  const byFingerprint = new Set<string>();
  for (const finding of findings) {
    const fingerprint = repositoryFindingFingerprint(finding);
    if (!fingerprint || byFingerprint.has(fingerprint)) {
      continue;
    }
    byFingerprint.add(fingerprint);
    candidates.push(finding);
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return candidates.slice(0, maxFindings).map((finding) => sanitizePriorFinding(finding));
}

function sanitizePriorFinding(finding: RepositoryScanFinding): RepositoryScanFinding {
  const location = toRecord(finding.location);
  const details = toRecord(finding.details);

  const filepathRaw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  const filepath = typeof filepathRaw === "string" ? normalizePath(filepathRaw) : null;

  const startLine = normalizeLineNumber(location.startLine ?? location.start_line ?? location.line);
  const endLine = normalizeLineNumber(location.endLine ?? location.end_line ?? location.lineEnd ?? location.end);

  return {
    repositoryFullName: finding.repositoryFullName,
    severity: finding.severity,
    summary: finding.summary,
    location: filepath || startLine || endLine ? { filepath, startLine, endLine } : null,
    details
  };
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\/*/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

async function writeLlmDebugArtifact(
  config: HadrixConfig,
  label: string,
  response: string
): Promise<string> {
  const dir = path.join(config.stateDir, "llm-errors");
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  const filename = `${label}-${timestamp}-${suffix}.txt`;
  const filePath = path.join(dir, filename);
  const content = [
    "LLM response (raw):",
    "",
    response
  ].join("\n");
  await writeFile(filePath, content, "utf-8");
  const relative = path.relative(process.cwd(), filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}
