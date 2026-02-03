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
  BASE_RULE_EVAL_PROMPT,
  buildRepositoryCompositeSystemPrompt,
  buildRepositoryContextPrompt,
  buildRepositoryScanOutputSchema,
  buildRepositoryRuleBatchSystemPrompt,
  formatRuleCardCompact
} from "./prompts/repositoryPrompts.js";
import { buildChunkUnderstandingSystemPrompt } from "./prompts/llmUnderstandingPrompts.js";
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
  packedRuleIds: string[];
  selectionFamilies: string[];
  selectionStrategy: "signals_primary" | "role_fallback" | "baseline_fallback";
  selectionHighRisk: boolean;
};

type RuleCatalogEntry = {
  id: string;
  title: string;
  description: string;
  category: string;
};

type RuleScanTask = {
  chunkId: string;
  ruleIds: string[];
  file: RepositoryFileSample;
  existingFindings: ExistingScanFinding[];
  taskKey: string;
  llmUnderstanding: LlmChunkUnderstanding | null;
  familyMapping: LlmFamilyMapping | null;
};

type OpenScanTask = {
  fileInsight: LlmFileInsight;
  existingFindings: ExistingScanFinding[];
  taskKey: string;
};

const DEFAULT_MAP_CONCURRENCY = 4;
const DEFAULT_MAX_EXISTING_FINDINGS_PER_REPO = 80;
const DEFAULT_MAX_PRIOR_FINDINGS_PER_REPO = 40;
const DEFAULT_RULE_SCAN_CONCURRENCY = 8;
const DEFAULT_MIN_RULES_PER_CHUNK = 3;
const DEFAULT_FALLBACK_RULE_CAP = 5;
const DEFAULT_RULE_EVAL_MAX_PROMPT_TOKENS = 6500;
const DEFAULT_RULE_EVAL_MAX_RULES_PER_CHUNK_SOFT = 15;
const DEFAULT_RULE_EVAL_MAX_RULES_PER_CHUNK_HARD = 25;
const OPEN_SCAN_MIN_RULES = 4;

const RULE_CLUSTER_BY_ID: Record<string, string> = {
  missing_authentication: "auth_enforcement",
  missing_server_action_auth: "auth_enforcement",
  missing_role_check: "auth_enforcement",
  frontend_only_authorization: "auth_enforcement",
  idor: "auth_enforcement",
  org_id_trust: "auth_enforcement",
  missing_admin_mfa: "auth_enforcement",
  missing_lockout: "auth_enforcement",
  missing_secure_token_handling: "auth_enforcement",
  session_fixation: "auth_enforcement",
  jwt_validation_bypass: "auth_enforcement",
  weak_jwt_secret: "auth_enforcement",
  weak_token_generation: "auth_enforcement",
  weak_password_hashing: "auth_enforcement",
  anon_key_bearer: "auth_enforcement",
  missing_bearer_token: "auth_enforcement",

  missing_webhook_signature: "webhook_security",
  missing_replay_protection: "webhook_security",
  missing_webhook_config_integrity: "webhook_security",
  webhook_code_execution: "webhook_security",

  sql_injection: "injection_exec",
  unsafe_query_builder: "injection_exec",
  command_injection: "injection_exec",
  dangerous_html_render: "injection_exec",
  template_injection: "injection_exec",
  path_traversal: "injection_exec",
  nosql_injection: "injection_exec",
  ldap_injection: "injection_exec",
  xpath_injection: "injection_exec",

  frontend_secret_exposure: "secrets_logging",
  sensitive_logging: "secrets_logging",
  command_output_logging: "secrets_logging",
  plaintext_secrets: "secrets_logging",
  sensitive_client_storage: "secrets_logging",
  debug_auth_leak: "secrets_logging",
  weak_encryption: "secrets_logging",

  permissive_cors: "hardening_limits",
  public_storage_bucket: "hardening_limits",
  missing_timeout: "hardening_limits",
  missing_rate_limiting: "hardening_limits",
  missing_audit_logging: "hardening_limits",
  missing_output_sanitization: "hardening_limits",
  missing_input_validation: "hardening_limits",
  missing_least_privilege: "hardening_limits",
  unbounded_query: "hardening_limits",
  missing_upload_size_limit: "hardening_limits",
  unrestricted_file_upload: "hardening_limits",
  verbose_error_messages: "hardening_limits",
  debug_mode_in_production: "hardening_limits",
  missing_security_headers: "hardening_limits",
  frontend_login_rate_limit: "hardening_limits",
  insecure_temp_files: "hardening_limits",
  log_injection: "hardening_limits",

  frontend_direct_db_write: "data_access",
  mass_assignment: "data_access",
  excessive_data_exposure: "data_access",
  weak_rls_policies: "data_access"
};

type MappingBatchOptions = {
  basePromptTokens: number;
  maxPromptTokens: number;
  minBatchSize: number;
  maxBatchChunks: number;
};

type RulePackingResult = {
  packedRuleIds: string[];
  estimatedPromptTokens: number;
  truncated: boolean;
  truncationReason?: "token_budget" | "hard_cap";
};

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
const HIGH_RISK_SIGNAL_IDS = new Set<SignalId>([
  "exec_sink",
  "raw_sql_sink",
  "webhook_handler",
  "ssrf_candidate",
  "file_write_sink",
  "frontend_dom_write",
  "template_render"
]);
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

const PASSWORD_INPUT_PATTERN =
  /type\s*=\s*["']password["']|name\s*=\s*["']password["']|formdata\.get\(\s*["']password["']\s*\)|\breq\.(?:body|query|params)\.password\b|\bpassword\b\s*[:=]/i;
const LOGIN_ACTION_PATTERN =
  /\b(signinwithpassword|sign_in_with_password|signin|sign-in|log\s*in|loginaction|authenticate|auth\.signin|signsession|createsession|setsession)\b|cookies\(\)\.set\(\s*["']session["']/i;
const INLINE_OPTIONAL_BEARER_PATTERN =
  /Bearer\s*\$\{[^}]*?(?:\?\?|\|\|)\s*["']["'][^}]*\}/i;
const TOKEN_DEFAULT_PATTERN =
  /\b(?:const|let|var)\s+(\w+)\s*=\s*[^;\n]*?(?:\?\?|\|\|)\s*["']["']/g;
const AUTH_HEADER_READ_PATTERN =
  /\bheaders\.get\(\s*["']authorization["']\s*\)/i;
const BEARER_MARKER_PATTERN = /\bBearer\s+/i;
const CLIENT_DIRECTIVE_PATTERN = /["']use client["']/i;
const SUPABASE_IMPORT_PATTERN = /@supabase\/supabase-js/i;
const SUPABASE_CREATE_PATTERN = /\bcreateClient\s*\(/i;
const SUPABASE_WRITE_PATTERN =
  /\bfrom\(\s*["'`][^"'`]+["'`]\s*\)\.(insert|update|upsert|delete)\s*\(/i;
const CORS_ALLOW_ORIGIN_PATTERN = /access-control-allow-origin/i;
const CORS_ALLOW_ORIGIN_WILDCARD_PATTERN =
  /access-control-allow-origin[^\n]{0,80}["']?\*["']?/i;
const CORS_SET_HEADER_PATTERN =
  /setHeader\(\s*["']Access-Control-Allow-Origin["']\s*,\s*["']\*["']\s*\)/i;
const DEBUG_FLAG_PATTERN = /\bdebug\s*:\s*true\b/i;
const HEADERS_DUMP_PATTERN =
  /headers\.entries\(\)|Object\.fromEntries\([^)]*headers\.entries\(\)\)/i;
const ENV_DUMP_PATTERN = /\bprocess\.env\b|\bDeno\.env\b/i;
const PUBLIC_API_KEY_PATTERN =
  /\bSUPABASE_ANON_KEY\b|\bNEXT_PUBLIC_SUPABASE_ANON_KEY\b|\bsupabaseAnonKey\b/i;
const SUPABASE_ANON_HELPER_PATTERN = /\bsupabaseAnon\b/i;
const SUPABASE_CLIENT_USAGE_PATTERN =
  /\bcreateClient\s*\(|\bfrom\(\s*["'`][^"'`]+["'`]\s*\)/i;
const AUTH_BEARER_HEADER_PATTERN = /\bauthorization\b[^;]*\bBearer\b/i;
const STORAGE_BUCKET_PATTERN = /\bbucket\b/i;
const PUBLIC_BUCKET_NAME_PATTERN = /["'`][^"'`]*public[^"'`]*["'`]/i;
const PUBLIC_BUCKET_CONFIG_PATTERN = /\bpublic\s*:\s*true\b/i;
const REQUEST_PARAM_CAPTURE_PATTERN = /\breq\.(?:params|query)\.([A-Za-z0-9_]+)\b/g;
const SEARCH_PARAM_CAPTURE_PATTERN = /searchParams\.get\(\s*["']([A-Za-z0-9_]+)["']\s*\)/g;
const ID_LIKE_PARAM_NAMES = new Set([
  "id",
  "userid",
  "user_id",
  "email",
  "orgid",
  "org_id",
  "accountid",
  "account_id",
  "projectid",
  "project_id",
  "tenantid",
  "tenant_id",
  "resourceid",
  "resource_id",
  "orderid",
  "order_id"
]);
const USER_ID_PARAM_NAMES = new Set(["userid", "user_id", "email"]);
const ORG_ID_PARAM_NAMES = new Set(["orgid", "org_id", "tenantid", "tenant_id"]);

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectLoginAttempt(content: string): boolean {
  if (!content) return false;
  const hasPasswordInput = PASSWORD_INPUT_PATTERN.test(content);
  if (!hasPasswordInput) return false;
  return LOGIN_ACTION_PATTERN.test(content);
}

function detectOptionalBearerToken(content: string): boolean {
  if (!content || !/Bearer\b/i.test(content)) return false;
  if (INLINE_OPTIONAL_BEARER_PATTERN.test(content)) return true;
  const tokenDefaults = new Set<string>();
  for (const match of content.matchAll(TOKEN_DEFAULT_PATTERN)) {
    if (match[1]) tokenDefaults.add(match[1]);
  }
  if (tokenDefaults.size === 0) return false;
  for (const tokenVar of tokenDefaults) {
    const escaped = escapeRegExp(tokenVar);
    const templatePattern = new RegExp(`Bearer\\s*\\$\\{\\s*${escaped}\\s*\\}`, "i");
    const concatPattern = new RegExp(`Bearer\\s*["']\\s*\\+\\s*${escaped}\\b`, "i");
    if (templatePattern.test(content) || concatPattern.test(content)) return true;
  }
  return false;
}

function detectAuthHeaderPresence(content: string): boolean {
  if (!content) return false;
  return AUTH_HEADER_READ_PATTERN.test(content) && BEARER_MARKER_PATTERN.test(content);
}

function detectPermissiveCors(content: string): boolean {
  if (!content || !CORS_ALLOW_ORIGIN_PATTERN.test(content)) return false;
  return (
    CORS_SET_HEADER_PATTERN.test(content) ||
    CORS_ALLOW_ORIGIN_WILDCARD_PATTERN.test(content)
  );
}

function detectDebugAuthLeak(content: string): boolean {
  if (!content || !DEBUG_FLAG_PATTERN.test(content)) return false;
  return HEADERS_DUMP_PATTERN.test(content) || ENV_DUMP_PATTERN.test(content);
}

function detectPublicApiKeyUsage(content: string): boolean {
  if (!content) return false;
  const hasAnonKey = PUBLIC_API_KEY_PATTERN.test(content);
  const hasAnonHelper = SUPABASE_ANON_HELPER_PATTERN.test(content);
  const hasClientUsage = SUPABASE_CLIENT_USAGE_PATTERN.test(content);
  const hasBearer = AUTH_BEARER_HEADER_PATTERN.test(content);
  if (hasAnonKey && (hasClientUsage || hasBearer)) return true;
  if (hasAnonHelper && hasClientUsage) return true;
  return false;
}

function detectPublicStorageBucket(content: string): boolean {
  if (!content) return false;
  if (PUBLIC_BUCKET_CONFIG_PATTERN.test(content)) return true;
  return STORAGE_BUCKET_PATTERN.test(content) && PUBLIC_BUCKET_NAME_PATTERN.test(content);
}

function normalizeParamName(value: string): string {
  return value.replace(/[^A-Za-z0-9_]/g, "").toLowerCase();
}

function detectClientSuppliedIdentifiers(content: string): {
  hasId: boolean;
  hasUserId: boolean;
  hasOrgId: boolean;
} {
  if (!content) return { hasId: false, hasUserId: false, hasOrgId: false };
  const names = new Set<string>();
  for (const match of content.matchAll(REQUEST_PARAM_CAPTURE_PATTERN)) {
    if (match[1]) names.add(normalizeParamName(match[1]));
  }
  for (const match of content.matchAll(SEARCH_PARAM_CAPTURE_PATTERN)) {
    if (match[1]) names.add(normalizeParamName(match[1]));
  }
  if (names.size === 0) return { hasId: false, hasUserId: false, hasOrgId: false };
  let hasId = false;
  let hasUserId = false;
  let hasOrgId = false;
  for (const name of names) {
    if (USER_ID_PARAM_NAMES.has(name)) {
      hasUserId = true;
      hasId = true;
      continue;
    }
    if (ORG_ID_PARAM_NAMES.has(name)) {
      hasOrgId = true;
      hasId = true;
      continue;
    }
    if (ID_LIKE_PARAM_NAMES.has(name)) {
      hasId = true;
    }
  }
  return { hasId, hasUserId, hasOrgId };
}

function detectClientDbWrite(content: string): boolean {
  if (!content) return false;
  if (!CLIENT_DIRECTIVE_PATTERN.test(content)) return false;
  if (!(SUPABASE_IMPORT_PATTERN.test(content) || SUPABASE_CREATE_PATTERN.test(content))) {
    return false;
  }
  return SUPABASE_WRITE_PATTERN.test(content);
}

function collectStaticSignals(file: RepositoryFileSample): LlmChunkUnderstandingSignal[] {
  const content = typeof file.content === "string" ? file.content : "";
  if (!content) return [];
  const signals: LlmChunkUnderstandingSignal[] = [];
  if (detectLoginAttempt(content)) {
    signals.push({
      id: "login_attempt_present",
      evidence: "password login attempt detected",
      confidence: 0.72
    });
  }
  if (detectOptionalBearerToken(content)) {
    signals.push({
      id: "bearer_token_optional",
      evidence: "bearer token defaults to empty or optional value",
      confidence: 0.82
    });
  }
  if (detectAuthHeaderPresence(content)) {
    signals.push({
      id: "auth_header_present",
      evidence: "reads Authorization bearer token from request headers",
      confidence: 0.74
    });
  }
  if (detectPermissiveCors(content)) {
    signals.push({
      id: "cors_permissive_or_unknown",
      evidence: "CORS allow-origin wildcard detected",
      confidence: 0.78
    });
  }
  if (detectDebugAuthLeak(content)) {
    signals.push({
      id: "debug_endpoint",
      evidence: "debug response exposes headers or env details",
      confidence: 0.76
    });
    signals.push({
      id: "logs_sensitive",
      evidence: "debug response includes request headers or env values",
      confidence: 0.72
    });
  }
  if (detectPublicApiKeyUsage(content)) {
    signals.push({
      id: "public_api_key_usage",
      evidence: "public/anon API key used for client or bearer access",
      confidence: 0.74
    });
  }
  if (detectPublicStorageBucket(content)) {
    signals.push({
      id: "public_storage_bucket",
      evidence: "storage bucket marked as public",
      confidence: 0.7
    });
  }
  const idSignals = detectClientSuppliedIdentifiers(content);
  if (idSignals.hasId) {
    signals.push({
      id: "id_in_path_or_query",
      evidence: "identifier read from request params or query",
      confidence: 0.74
    });
  }
  if (idSignals.hasUserId) {
    signals.push({
      id: "client_supplied_user_id",
      evidence: "user identifier read from request params or query",
      confidence: 0.76
    });
  }
  if (idSignals.hasOrgId) {
    signals.push({
      id: "client_supplied_org_id",
      evidence: "org/tenant identifier read from request params or query",
      confidence: 0.76
    });
  }
  if (detectClientDbWrite(content)) {
    signals.push({
      id: "client_db_write",
      evidence: "client code performs direct database write via supabase.from(...).insert/update",
      confidence: 0.78
    });
  }
  return signals;
}

function mergeSignals(
  base: LlmChunkUnderstandingSignal[],
  additions: LlmChunkUnderstandingSignal[]
): void {
  if (!additions.length) return;
  const seen = new Set(base.map((signal) => signal.id));
  for (const signal of additions) {
    if (seen.has(signal.id)) continue;
    base.push(signal);
    seen.add(signal.id);
  }
}

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
    "public_storage_bucket",
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

export function resolveRuleCluster(ruleId: string): string {
  return RULE_CLUSTER_BY_ID[ruleId] ?? "misc";
}

export function buildRuleScanBatches(params: {
  candidateRuleIds: string[];
  basePromptTokens: number;
  maxPromptTokens: number;
  softRuleCap: number;
  hardRuleCap: number;
  ruleTokensById: Map<string, number>;
}): RulePackingResult & { batches: string[][] } {
  const packing = packRuleIdsByTokenBudget(params);
  return {
    ...packing,
    batches: packing.packedRuleIds.length > 0 ? [packing.packedRuleIds] : []
  };
}

export function chunkRuleIds(ruleIds: string[], size: number): string[][] {
  if (ruleIds.length === 0) return [];
  const batchSize = Math.max(1, Math.trunc(size));
  const clusters = new Map<string, string[]>();
  for (const ruleId of ruleIds) {
    const clusterId = resolveRuleCluster(ruleId);
    if (!clusters.has(clusterId)) {
      clusters.set(clusterId, []);
    }
    clusters.get(clusterId)!.push(ruleId);
  }
  const batches: string[][] = [];
  for (const clusterRuleIds of clusters.values()) {
    for (let i = 0; i < clusterRuleIds.length; i += batchSize) {
      batches.push(clusterRuleIds.slice(i, i + batchSize));
    }
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

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function estimateMappingChunkTokens(file: RepositoryFileSample): number {
  const chunkIdPlaceholder = "x".repeat(64);
  const header = [
    `chunk_id:${chunkIdPlaceholder}`,
    `file_path:${file.path}`,
    `language:${inferLanguage(file.path)}`,
    "chunk_text:"
  ].join("\n");
  const text = `${header}${file.content ?? ""}`;
  return estimateTokens(text);
}

function estimateMappingBatchTokens(
  batch: RepositoryFileSample[],
  basePromptTokens: number
): number {
  let total = basePromptTokens;
  for (const file of batch) {
    total += estimateMappingChunkTokens(file);
  }
  return total;
}

export function packRuleIdsByTokenBudget(params: {
  candidateRuleIds: string[];
  basePromptTokens: number;
  maxPromptTokens: number;
  softRuleCap: number;
  hardRuleCap: number;
  ruleTokensById: Map<string, number>;
}): RulePackingResult {
  const {
    candidateRuleIds,
    basePromptTokens,
    maxPromptTokens,
    softRuleCap,
    hardRuleCap,
    ruleTokensById
  } = params;
  const packed: string[] = [];
  let tokenCount = basePromptTokens;
  let truncationReason: RulePackingResult["truncationReason"];
  const eligibleRuleCount = candidateRuleIds.filter((ruleId) => ruleTokensById.has(ruleId)).length;
  const softLimit = Math.max(1, Math.trunc(softRuleCap));
  const hardLimit = Math.max(softLimit, Math.trunc(hardRuleCap));

  for (const ruleId of candidateRuleIds) {
    if (!ruleTokensById.has(ruleId)) continue;
    if (packed.length >= hardLimit) {
      truncationReason = "hard_cap";
      break;
    }
    const ruleTokens = ruleTokensById.get(ruleId)!;
    if (tokenCount + ruleTokens > maxPromptTokens) {
      truncationReason = "token_budget";
      break;
    }
    packed.push(ruleId);
    tokenCount += ruleTokens;
  }

  const truncated = packed.length < eligibleRuleCount;
  if (truncated && !truncationReason) {
    truncationReason = "token_budget";
  }

  return {
    packedRuleIds: packed,
    estimatedPromptTokens: tokenCount,
    truncated,
    truncationReason
  };
}

export function buildMappingBatches(
  files: RepositoryFileSample[],
  options: MappingBatchOptions
): RepositoryFileSample[][] {
  if (files.length === 0) return [];

  const groups = new Map<string, RepositoryFileSample[]>();
  const ensureGroup = (key: string) => {
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    return groups.get(key)!;
  };

  for (const file of files) {
    const groupKey = file.overlapGroupId
      ? `overlap:${file.overlapGroupId}`
      : file.path
        ? `file:${file.path}`
        : "misc";
    ensureGroup(groupKey).push(file);
  }

  const batches: RepositoryFileSample[][] = [];
  const maxPromptTokens = Math.max(1, Math.trunc(options.maxPromptTokens));
  const minBatchSize = Math.max(1, Math.trunc(options.minBatchSize));
  const maxBatchChunks = Math.max(minBatchSize, Math.trunc(options.maxBatchChunks));

  for (const group of groups.values()) {
    let current: RepositoryFileSample[] = [];
    let currentTokens = options.basePromptTokens;

    for (const file of group) {
      const nextTokens = estimateMappingChunkTokens(file);
      const wouldExceed =
        current.length > 0 &&
        (currentTokens + nextTokens > maxPromptTokens || current.length >= maxBatchChunks);
      if (wouldExceed) {
        batches.push(current);
        current = [];
        currentTokens = options.basePromptTokens;
      }
      current.push(file);
      currentTokens += nextTokens;
    }

    if (current.length > 0) {
      batches.push(current);
    }
  }

  return batches;
}

type BatchCircuitBreakerOptions<T, R> = {
  maxDepth: number;
  onRetry?: (info: { attempt: number; batchSize: number; reason: string; items: T[] }) => void;
  onExhausted?: (items: T[], reason: string) => R[];
};

export async function runWithCircuitBreaker<T, R>(
  items: T[],
  runBatch: (batch: T[]) => Promise<R[]>,
  options: BatchCircuitBreakerOptions<T, R>,
  attempt = 1
): Promise<R[]> {
  try {
    return await runBatch(items);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    options.onRetry?.({ attempt, batchSize: items.length, reason, items });
    if (items.length <= 1 || attempt >= options.maxDepth) {
      return options.onExhausted ? options.onExhausted(items, reason) : [];
    }
    const mid = Math.ceil(items.length / 2);
    const left = await runWithCircuitBreaker(items.slice(0, mid), runBatch, options, attempt + 1);
    const right = await runWithCircuitBreaker(items.slice(mid), runBatch, options, attempt + 1);
    return [...left, ...right];
  }
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
  const understandingSystemPrompt = [
    buildChunkUnderstandingSystemPrompt(),
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
  const rulePromptTokensById = new Map<string, number>();
  for (const rule of REPOSITORY_SCAN_RULES) {
    const compact = formatRuleCardCompact(rule);
    rulePromptTokensById.set(rule.id, estimateTokens(compact));
  }
  const outputSchemaText = JSON.stringify(outputSchema);

  const resumeResults = input.resume?.getRuleResults() ?? new Map<string, RepositoryScanFinding[]>();
  const resumedFindings: RepositoryScanFinding[] = [];
  const resumedOpenFindings: RepositoryScanFinding[] = [];
  let resumedTaskCount = 0;
  let ruleEvalCalls = 0;

  log("LLM scan (understanding, batched)...");
  const mapConcurrency = normalizeMapConcurrency(input.mapConcurrency);
  const ruleScanConcurrency = normalizeRuleScanConcurrency(
    input.config.llm?.ruleScanConcurrency
  );
  const understandingMaxPromptTokens = input.config.llm?.understandingMaxPromptTokens ?? 6500;
  const understandingMinBatchSize = input.config.llm?.understandingMinBatchSize ?? 1;
  const understandingMaxBatchChunks = input.config.llm?.understandingMaxBatchChunks ?? 8;
  const minRulesPerChunk =
    input.config.llm?.minRulesPerChunk ?? DEFAULT_MIN_RULES_PER_CHUNK;
  const ruleEvalMaxPromptTokens =
    input.config.llm?.ruleEvalMaxPromptTokens ?? DEFAULT_RULE_EVAL_MAX_PROMPT_TOKENS;
  const ruleEvalMaxRulesPerChunkSoft =
    input.config.llm?.ruleEvalMaxRulesPerChunkSoft ?? DEFAULT_RULE_EVAL_MAX_RULES_PER_CHUNK_SOFT;
  const ruleEvalMaxRulesPerChunkHard =
    input.config.llm?.ruleEvalMaxRulesPerChunkHard ?? DEFAULT_RULE_EVAL_MAX_RULES_PER_CHUNK_HARD;
  const normalizedRuleEvalMaxPromptTokens = Math.max(1, Math.trunc(ruleEvalMaxPromptTokens));
  const normalizedRuleEvalMaxRulesPerChunkSoft = Math.max(
    1,
    Math.trunc(ruleEvalMaxRulesPerChunkSoft)
  );
  const normalizedRuleEvalMaxRulesPerChunkHard = Math.max(
    normalizedRuleEvalMaxRulesPerChunkSoft,
    Math.trunc(ruleEvalMaxRulesPerChunkHard)
  );
  const mappingBasePromptTokens = estimateTokens(understandingSystemPrompt);
  const mappingBatches = buildMappingBatches(input.files, {
    basePromptTokens: mappingBasePromptTokens,
    maxPromptTokens: understandingMaxPromptTokens,
    minBatchSize: understandingMinBatchSize,
    maxBatchChunks: understandingMaxBatchChunks
  });

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
    const staticSignals = collectStaticSignals(file);
    let mergedUnderstanding = understanding;
    if (staticSignals.length > 0) {
      if (!mergedUnderstanding) {
        mergedUnderstanding = {
          chunk_id: chunkId,
          file_path: file.path,
          confidence: 0.2,
          signals: [],
          identifiers: []
        };
      }
      mergeSignals(mergedUnderstanding.signals, staticSignals);
    }
    const selection = resolveCandidateRuleIds({
      understanding: mergedUnderstanding,
      familyMapping,
      rulesById,
      fallbackRuleIds: BASELINE_RULE_IDS,
      minRulesPerChunk
    });
    const candidateRuleIds = selection.ruleIds;
    const basePromptText = [BASE_RULE_EVAL_PROMPT, systemContext].filter(Boolean).join("\n\n");
    const basePromptTokens = estimateTokens(
      [basePromptText, file.content ?? "", outputSchemaText].join("\n\n")
    );
    const packing = buildRuleScanBatches({
      candidateRuleIds,
      basePromptTokens,
      maxPromptTokens: normalizedRuleEvalMaxPromptTokens,
      softRuleCap: normalizedRuleEvalMaxRulesPerChunkSoft,
      hardRuleCap: normalizedRuleEvalMaxRulesPerChunkHard,
      ruleTokensById: rulePromptTokensById
    });
    const packedRuleIds = packing.packedRuleIds;
    const signalIds = extractSignalIds(mergedUnderstanding);
    if (input.debug) {
      logDebug(input.debug, {
        event: "llm_threat_mapping",
        file: {
          path: file.path,
          chunkIndex: file.chunkIndex,
          startLine: file.startLine,
          endLine: file.endLine
        },
        understandingConfidence: mergedUnderstanding?.confidence ?? 0,
        candidateRuleIds,
        signals: signalIds,
        signalCount: signalIds.length,
        rulesSelectedCount: packedRuleIds.length,
        eligibleRulesCount: candidateRuleIds.length,
        highRisk: selection.highRisk,
        strategy: selection.strategy,
        topSignals: signalIds.slice(0, 6),
        eligibleRulesTop: candidateRuleIds.slice(0, 8),
        selectionFamilies: selection.families
      });
      logDebug(input.debug, {
        event: "llm_rule_packing",
        file: {
          path: file.path,
          chunkIndex: file.chunkIndex,
          startLine: file.startLine,
          endLine: file.endLine
        },
        eligibleRulesCount: candidateRuleIds.length,
        packedRulesCount: packedRuleIds.length,
        packedRuleIds: packedRuleIds.slice(0, 8),
        truncated: packing.truncated,
        truncationReason: packing.truncationReason ?? null,
        estimatedPromptTokens: packing.estimatedPromptTokens
      });
      if (staticSignals.length > 0) {
        logDebug(input.debug, {
          event: "static_signal_detection",
          file: {
            path: file.path,
            chunkIndex: file.chunkIndex,
            startLine: file.startLine,
            endLine: file.endLine
          },
          staticSignals: staticSignals.map((signal) => signal.id)
        });
      }
    }
    log(
      [
        "LLM map",
        `${file.path}:${file.startLine}-${file.endLine}`,
        `signals=${signalIds.length}`,
        `families=${selection.families.length ? selection.families.join(",") : "none"}`,
        `eligibleRules=${candidateRuleIds.length}`,
        `packedRules=${packedRuleIds.length}`,
        `highRisk=${selection.highRisk ? "yes" : "no"}`,
        `strategy=${selection.strategy}`
      ].join(" | ")
    );
    return {
      file,
      chunkId,
      understanding: mergedUnderstanding,
      familyMapping,
      candidateRuleIds,
      packedRuleIds,
      selectionFamilies: selection.families,
      selectionStrategy: selection.strategy,
      selectionHighRisk: selection.highRisk
    };
  };

  type MappingItem = { file: RepositoryFileSample; chunkId: string };

  const runUnderstandingBatch = async (items: MappingItem[]): Promise<LlmFileInsight[]> => {
    const mappingPayload =
      items.length === 1
        ? buildMappingPayload(items[0].file, items[0].chunkId)
        : items.map((item) => buildMappingPayload(item.file, item.chunkId));

    const mappingResponse = await runChatCompletion(input.config, [
      { role: "system", content: understandingSystemPrompt },
      { role: "user", content: JSON.stringify(mappingPayload, null, 2) }
    ]);

    try {
      const understandings = parseChunkUnderstandingBatch(
        mappingResponse,
        items.map((item) => ({ chunkId: item.chunkId, filePath: item.file.path }))
      );
      return items.map((item, index) =>
        buildFileInsight(item.file, item.chunkId, understandings[index], null)
      );
    } catch (err) {
      const label = items.length > 1 ? "llm-understanding-batch" : "llm-understanding";
      const savedPath = await writeLlmDebugArtifact(
        input.config,
        label,
        mappingResponse
      );
      const message = err instanceof Error ? err.message : String(err);
      log(
        `LLM understanding parse error for ${items.length} chunk(s). ${message}. Saved response: ${savedPath}`
      );
      logDebug(input.debug, {
        event: "llm_understanding_parse_error",
        message,
        savedPath,
        batchSize: items.length
      });
      throw err;
    }
  };

  const mapBatch = async (batch: RepositoryFileSample[]): Promise<LlmFileInsight[]> => {
    const batchItems = batch.map((file) => ({
      file,
      chunkId: buildChunkKey(file)
    }));
    const maxDepth = Math.ceil(Math.log2(batchItems.length)) + 2;
    return runWithCircuitBreaker(
      batchItems,
      runUnderstandingBatch,
      {
        maxDepth,
        onRetry: ({ attempt, batchSize, reason, items }) => {
          const estimatedTokens = estimateMappingBatchTokens(
            items.map((item) => item.file),
            mappingBasePromptTokens
          );
          logDebug(input.debug, {
            event: "llm_understanding_retry",
            attempt,
            batchSize,
            estimatedTokens,
            reason
          });
        },
        onExhausted: (items, reason) => {
          logDebug(input.debug, {
            event: "llm_understanding_retry_exhausted",
            attempt: maxDepth,
            batchSize: items.length,
            reason
          });
          return items.map((item) => buildFileInsight(item.file, item.chunkId, null, null));
        }
      }
    );
  };

  const buildRuleBatchPrompt = (ruleIds: string[]): string => {
    const rules = ruleIds
      .map((ruleId) => rulesById.get(ruleId))
      .filter(Boolean) as RuleScanDefinition[];
    const systemPrompt = buildRepositoryRuleBatchSystemPrompt(rules);
    return [systemPrompt, systemContext].filter(Boolean).join("\n\n");
  };

  const runRuleBatchOnce = async (
    ruleIds: string[],
    file: RepositoryFileSample,
    existing: ExistingScanFinding[],
    context: {
      llmUnderstanding: LlmChunkUnderstanding | null;
      familyMapping: LlmFamilyMapping | null;
    }
  ): Promise<RepositoryScanFinding[]> => {
    if (ruleIds.length === 0) return [];
    const systemPrompt = buildRuleBatchPrompt(ruleIds);
    const filePayload = {
      path: file.path,
      startLine: file.startLine,
      endLine: file.endLine,
      chunkIndex: file.chunkIndex,
      truncated: file.truncated ?? false,
      content: file.content,
      llmUnderstanding: context.llmUnderstanding ?? undefined,
      familyMapping: context.familyMapping ?? undefined,
      candidateRuleIds: ruleIds.length ? ruleIds : undefined
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

    ruleEvalCalls += 1;
    const response = await runChatCompletion(input.config, [
      { role: "system", content: systemPrompt },
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
      if (parsed.length > 0 && scoped.length === 0) {
        throw new Error("LLM returned findings without matching rule ids.");
      }
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
      throw err;
    }
  };

  const runRuleBatchWithRetry = async (
    ruleIds: string[],
    file: RepositoryFileSample,
    existing: ExistingScanFinding[],
    context: {
      llmUnderstanding: LlmChunkUnderstanding | null;
      familyMapping: LlmFamilyMapping | null;
    }
  ): Promise<RepositoryScanFinding[]> => {
    const maxDepth = Math.ceil(Math.log2(ruleIds.length || 1)) + 2;
    return runWithCircuitBreaker(
      ruleIds,
      (batchRuleIds) => runRuleBatchOnce(batchRuleIds, file, existing, context),
      {
        maxDepth,
        onRetry: ({ attempt, batchSize, reason, items }) => {
          logDebug(input.debug, {
            event: "llm_rule_retry",
            attempt,
            batchSize,
            reason,
            ruleIds: items
          });
        }
      }
    );
  };

  const fileInsights = (await runWithConcurrency(
    mappingBatches,
    mapConcurrency,
    mapBatch
  )).flat();

  const tasks: RuleScanTask[] = [];
  const ruleFindingsByChunk = new Map<string, RepositoryScanFinding[]>();
  log("LLM scan (rule diagnosis)...");
  for (const insight of fileInsights) {
    const ruleIds = insight.packedRuleIds;
    if (ruleIds.length === 0) continue;
    const taskKey = buildRuleBatchTaskKey(ruleIds, insight.file);
    if (resumeResults.has(taskKey)) {
      const stored = resumeResults.get(taskKey);
      if (stored && stored.length > 0) {
        resumedFindings.push(...stored);
        const existing = ruleFindingsByChunk.get(insight.chunkId) ?? [];
        existing.push(...stored);
        ruleFindingsByChunk.set(insight.chunkId, existing);
      }
      resumedTaskCount += 1;
      continue;
    }
    tasks.push({
      chunkId: insight.chunkId,
      ruleIds,
      file: insight.file,
      existingFindings,
      taskKey,
      llmUnderstanding: insight.understanding,
      familyMapping: insight.familyMapping
    });
  }

  const rulePackingSummary = (() => {
    if (fileInsights.length === 0) return null;
    const totalEligibleRules = fileInsights.reduce(
      (sum, insight) => sum + insight.candidateRuleIds.length,
      0
    );
    const totalPackedRules = fileInsights.reduce(
      (sum, insight) => sum + insight.packedRuleIds.length,
      0
    );
    const maxEligibleRules = fileInsights.reduce(
      (max, insight) => Math.max(max, insight.candidateRuleIds.length),
      0
    );
    const maxPackedRules = fileInsights.reduce(
      (max, insight) => Math.max(max, insight.packedRuleIds.length),
      0
    );
    return {
      chunks: fileInsights.length,
      totalEligibleRules,
      totalPackedRules,
      avgEligibleRulesPerChunk: totalEligibleRules / fileInsights.length,
      avgPackedRulesPerChunk: totalPackedRules / fileInsights.length,
      maxEligibleRules,
      maxPackedRules
    };
  })();

  const results = await runWithConcurrency(tasks, ruleScanConcurrency, async (task) => {
    const { ruleIds, file, existingFindings: existing, taskKey, llmUnderstanding, familyMapping } = task;
    const scoped = await runRuleBatchWithRetry(
      ruleIds,
      file,
      existing,
      { llmUnderstanding, familyMapping }
    );
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
  });

  results.forEach((scoped, index) => {
    const task = tasks[index];
    if (!task) return;
    if (scoped.length === 0) return;
    const existing = ruleFindingsByChunk.get(task.chunkId) ?? [];
    existing.push(...scoped);
    ruleFindingsByChunk.set(task.chunkId, existing);
  });

  if (rulePackingSummary) {
    const avgCallsPerChunk = ruleEvalCalls / rulePackingSummary.chunks;
    log(
      `LLM rule eval summary: chunks=${rulePackingSummary.chunks}, avgEligibleRulesPerChunk=${rulePackingSummary.avgEligibleRulesPerChunk.toFixed(
        2
      )}, avgPackedRulesPerChunk=${rulePackingSummary.avgPackedRulesPerChunk.toFixed(
        2
      )}, maxEligibleRulesPerChunk=${rulePackingSummary.maxEligibleRules}, maxPackedRulesPerChunk=${rulePackingSummary.maxPackedRules}, ruleEvalCalls=${ruleEvalCalls}, avgCallsPerChunk=${avgCallsPerChunk.toFixed(
        2
      )}, ruleScanConcurrency=${ruleScanConcurrency}`
    );
  }

  const openScanTasks: OpenScanTask[] = [];
  const openScanGroupSeen = new Set<string>();
  for (const insight of fileInsights) {
    const ruleFindings = ruleFindingsByChunk.get(insight.chunkId) ?? [];
    const decision = getOpenScanDecision({
      understanding: insight.understanding,
      selectedRuleIds: insight.packedRuleIds,
      ruleFindingsSoFar: ruleFindings,
      strategy: insight.selectionStrategy
    });

    if (input.debug) {
      logDebug(input.debug, {
        event: "llm_open_scan_decision",
        file: {
          path: insight.file.path,
          chunkIndex: insight.file.chunkIndex,
          startLine: insight.file.startLine,
          endLine: insight.file.endLine
        },
        reasons: decision.reasons,
        shouldRun: decision.shouldRun,
        signalCount: decision.signalCount,
        highRisk: decision.highRisk,
        rulesSelectedCount: insight.packedRuleIds.length,
        strategy: insight.selectionStrategy,
        findingsSoFar: ruleFindings.length
      });
    }

    if (!decision.shouldRun) continue;

    const groupKey = insight.file.overlapGroupId
      ? `overlap:${insight.file.overlapGroupId}`
      : `chunk:${insight.chunkId}`;
    if (openScanGroupSeen.has(groupKey)) continue;
    openScanGroupSeen.add(groupKey);

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
    log(
      `LLM open scan gating: openScans=${openScanTasks.length}, skipped=${fileInsights.length - openScanTasks.length}`
    );
  }

  await input.resume?.setRuleTaskCount(
    tasks.length + openScanTasks.length + resumedTaskCount
  );

  log("LLM scan (open scan)...");
  const openScanResults = await runWithConcurrency(
    openScanTasks,
    ruleScanConcurrency,
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
        candidateRuleIds: fileInsight.packedRuleIds.length
          ? fileInsight.packedRuleIds
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

function normalizeRuleScanConcurrency(value?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return DEFAULT_RULE_SCAN_CONCURRENCY;
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
  } else if (exposure === "internal") {
    addSignal("internal_entrypoint", "exposure marked internal", 0.7);
  }

  const role = typeof understanding.role === "string" ? understanding.role.trim().toLowerCase() : "";
  if (role === "api_handler") {
    addSignal("api_handler", "role indicates API handler", 0.8);
  } else if (role === "job_worker") {
    addSignal("job_worker", "role indicates background worker", 0.75);
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
  for (const sink of dataSinks) {
    if (!sink || typeof sink !== "object" || Array.isArray(sink)) continue;
    const sinkRecord = sink as Record<string, unknown>;
    const type = typeof sinkRecord.type === "string" ? sinkRecord.type.trim().toLowerCase() : "";
    if (!type) continue;
    if (type.includes("template")) {
      addSignal("template_render", "data_sinks includes template render", 0.8);
    }
    if (type.includes("dom")) {
      addSignal("frontend_dom_write", "data_sinks includes DOM writes", 0.8);
    }
    if (type.includes("redirect")) {
      addSignal("redirect_sink", "data_sinks includes redirect", 0.7);
    }
    if (type.includes("http") || type.includes("fetch") || type.includes("request")) {
      addSignal("http_request_sink", "data_sinks includes http requests", 0.75);
    }
    if (type.includes("file_write") || type.includes("write_file") || type.includes("filewrite")) {
      addSignal("file_write_sink", "data_sinks includes file writes", 0.8);
    }
    if (type.includes("file_read") || type.includes("read_file") || type.includes("fileread")) {
      addSignal("file_read_sink", "data_sinks includes file reads", 0.75);
    }
    if (type.includes("eval")) {
      addSignal("eval_sink", "data_sinks includes eval/Function", 0.8);
    }
    if (type.includes("raw_sql") || (type.includes("sql") && type.includes("raw"))) {
      addSignal("raw_sql_sink", "data_sinks includes raw SQL", 0.85);
    }
    if (type.includes("orm")) {
      addSignal("orm_query_sink", "data_sinks includes ORM queries", 0.75);
    }
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

function parseChunkUnderstandingBatch(
  raw: string,
  fallbacks: Array<{ chunkId: string; filePath: string }>
): LlmChunkUnderstanding[] {
  const parsed = extractJson(raw);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("LLM returned invalid JSON for chunk understanding.");
  }
  const isArray = Array.isArray(parsed);
  if (fallbacks.length > 1 && !isArray) {
    throw new Error("Expected JSON array for batched chunk understanding.");
  }
  const records = isArray ? parsed : [parsed];
  if (records.length !== fallbacks.length) {
    throw new Error(`expected ${fallbacks.length} results, got ${records.length}`);
  }
  const results: LlmChunkUnderstanding[] = [];
  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error(`index ${i}: invalid record`);
    }
    const rawChunkId =
      typeof (record as Record<string, unknown>).chunk_id === "string"
        ? (record as Record<string, unknown>).chunk_id
        : "";
    if (!rawChunkId || !rawChunkId.trim()) {
      throw new Error(`index ${i}: missing chunk_id`);
    }
    if (rawChunkId.trim() !== fallbacks[i].chunkId) {
      throw new Error(`index ${i}: chunk_id mismatch`);
    }
    results.push(
      parseChunkUnderstandingRecord(record as Record<string, unknown>, fallbacks[i])
    );
  }
  return results;
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

function hasHighRiskSignal(signalSet: Set<SignalId>): boolean {
  for (const signal of HIGH_RISK_SIGNAL_IDS) {
    if (signalSet.has(signal)) return true;
  }
  return false;
}

function hasClientSuppliedIdSignal(signalSet: Set<SignalId>): boolean {
  return (
    signalSet.has("client_supplied_identifier") ||
    signalSet.has("client_supplied_org_id") ||
    signalSet.has("client_supplied_user_id")
  );
}

function isHighRiskChunk(
  understanding: LlmChunkUnderstanding,
  signalSet: Set<SignalId>
): boolean {
  const exposure =
    typeof understanding.exposure === "string"
      ? understanding.exposure.trim().toLowerCase()
      : "";
  const exposurePublic = exposure === "public";
  const highRiskSignals = hasHighRiskSignal(signalSet);
  const hasWebhook = signalSet.has("webhook_handler");
  const hasClientSuppliedId = hasClientSuppliedIdSignal(signalSet);
  const authzMissing = signalSet.has("authz_missing_or_unknown");

  return (
    (exposurePublic && highRiskSignals) ||
    (hasClientSuppliedId && authzMissing) ||
    hasWebhook
  );
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

type OpenScanDecision = {
  shouldRun: boolean;
  reasons: string[];
  highRisk: boolean;
  signalCount: number;
};

function getOpenScanDecision(params: {
  understanding: LlmChunkUnderstanding | null;
  selectedRuleIds: string[];
  ruleFindingsSoFar?: RepositoryScanFinding[];
  strategy: "signals_primary" | "role_fallback" | "baseline_fallback";
}): OpenScanDecision {
  const { understanding, selectedRuleIds, ruleFindingsSoFar, strategy } = params;
  const signalIds = extractSignalIds(understanding);
  const signalSet = new Set<SignalId>(signalIds);
  const lowCoverage = selectedRuleIds.length < OPEN_SCAN_MIN_RULES;
  const signalsMissing = signalIds.length === 0;
  const isFallback = strategy === "role_fallback" || strategy === "baseline_fallback";
  const highRisk = hasHighRiskSignal(signalSet);
  const findingsCount = ruleFindingsSoFar ? ruleFindingsSoFar.length : 0;

  const reasons: string[] = [];
  if (lowCoverage) reasons.push("low_rule_coverage");
  if (isFallback) reasons.push("role_fallback");
  if (signalsMissing) reasons.push("signals_missing");
  if (highRisk && findingsCount === 0) reasons.push("high_risk_no_findings");

  return {
    shouldRun: reasons.length > 0,
    reasons,
    highRisk,
    signalCount: signalIds.length
  };
}

export function shouldRunOpenScan(params: {
  understanding: LlmChunkUnderstanding | null;
  selectedRuleIds: string[];
  ruleFindingsSoFar?: RepositoryScanFinding[];
  strategy: "signals_primary" | "role_fallback" | "baseline_fallback";
}): boolean {
  return getOpenScanDecision(params).shouldRun;
}

export function resolveCandidateRuleIds(params: {
  understanding: LlmChunkUnderstanding | null;
  familyMapping: LlmFamilyMapping | null;
  rulesById: Map<string, RuleScanDefinition>;
  fallbackRuleIds: string[];
  minRulesPerChunk?: number;
}): {
  ruleIds: string[];
  families: string[];
  strategy: "signals_primary" | "role_fallback" | "baseline_fallback";
  highRisk: boolean;
} {
  const { understanding, familyMapping, rulesById, fallbackRuleIds } = params;
  const normalizeCap = (value: number | undefined, fallback: number): number => {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
    return Math.max(1, Math.trunc(value));
  };
  const minRules = normalizeCap(params.minRulesPerChunk, DEFAULT_MIN_RULES_PER_CHUNK);
  const filteredFallback = fallbackRuleIds.filter((ruleId) => rulesById.has(ruleId));
  if (!understanding) {
    return {
      ruleIds: filteredFallback,
      families: [],
      strategy: "baseline_fallback",
      highRisk: false
    };
  }

  const signalIds = extractSignalIds(understanding);
  const signalSet = new Set<SignalId>(signalIds);
  const highRisk = isHighRiskChunk(understanding, signalSet);
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
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    selected.push(entry.id);
  }

  const suggestedRuleIds = (familyMapping?.suggested_rule_ids ?? []).filter(Boolean);
  for (const ruleId of suggestedRuleIds) {
    if (!rulesById.has(ruleId) || seen.has(ruleId)) continue;
    seen.add(ruleId);
    selected.push(ruleId);
  }

  let strategy: "signals_primary" | "role_fallback" | "baseline_fallback" = "signals_primary";

  if (signalSet.size === 0 || selected.length < minRules) {
    const role =
      typeof understanding.role === "string"
        ? understanding.role.trim()
        : "unknown";
    const fallbackFamilies = ROLE_FAMILY_FALLBACKS[role] ?? ROLE_FAMILY_FALLBACKS.unknown;
    strategy = "role_fallback";
    const fallbackTarget = Math.min(DEFAULT_FALLBACK_RULE_CAP, Math.max(minRules, selected.length));

    for (const family of fallbackFamilies) {
      const ruleIds = FAMILY_RULES[family] ?? [];
      for (const ruleId of ruleIds) {
        if (selected.length >= fallbackTarget) break;
        if (!rulesById.has(ruleId) || seen.has(ruleId)) continue;
        seen.add(ruleId);
        selected.push(ruleId);
      }
      if (selected.length >= fallbackTarget) break;
    }

    if (selected.length === 0) {
      strategy = "baseline_fallback";
      for (const ruleId of filteredFallback) {
        if (selected.length >= fallbackTarget) break;
        if (seen.has(ruleId)) continue;
        seen.add(ruleId);
        selected.push(ruleId);
      }
    }
  }

  return {
    ruleIds: selected,
    families: deriveSelectionFamilies(selected, rulesById),
    strategy,
    highRisk
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
