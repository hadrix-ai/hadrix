import { readEnv as readConfigEnv } from "../config/env.js";
import type { SummaryComparator, SummaryComparison } from "./types.js";

const DEFAULT_MODEL = "gpt-5.2";
const DEFAULT_TIMEOUT_MS = 60000;
const FALLBACK_THRESHOLD = 0.47;
const SHORT_FALLBACK_THRESHOLD = 0.35;
const SHORT_EXPECTATION_TOKEN_LIMIT = 6;
const RULE_ID_ALIASES: Record<string, string> = {
  missing_rate_limiting: "rate_limiting",
  missing_rate_limit: "rate_limiting",
  frontend_login_rate_limit: "rate_limiting",
  rate_limiting: "rate_limiting",
  missing_audit_logging: "audit_logging",
  missing_audit_log: "audit_logging",
  audit_logging: "audit_logging",
  missing_lockout: "lockout",
  login_lockout_missing: "lockout",
  brute_force_defense: "lockout",
  brute_force_defenses: "lockout",
  bruteforce_defense: "lockout",
  credential_stuffing: "lockout",
  missing_timeout: "timeout",
  missing_timeouts: "timeout",
  timeout: "timeout",
  object_injection: "prototype_pollution",
  prototype_pollution: "prototype_pollution",
  idor: "idor",
  sql_injection: "sql_injection",
  command_injection: "command_injection",
  missing_webhook_signature: "webhook_signature",
  missing_webhook_config_integrity: "webhook_config_integrity",
  config_integrity: "webhook_config_integrity",
  config_url_integrity: "webhook_config_integrity",
  webhook_config: "webhook_config_integrity",
  unbounded_query: "unbounded_query",
  permissive_cors: "permissive_cors",
  throttling: "rate_limiting",
  login_throttling: "rate_limiting",
  request_throttling: "rate_limiting"
};
const RULE_HINT_PATTERNS: Array<{ hint: string; patterns: RegExp[] }> = [
  {
    hint: "rate_limiting",
    patterns: [/rate limit/i, /ratelimit/i, /throttl/i, /request thrott/i, /too many requests/i]
  },
  { hint: "audit_logging", patterns: [/audit log/i, /audit logging/i] },
  {
    hint: "lockout",
    patterns: [
      /lockout/i,
      /account lock/i,
      /brute[- ]?force/i,
      /brute[- ]?force (defen|protect|mitigat|guard)/i,
      /login attempts/i,
      /credential stuffing/i
    ]
  },
  { hint: "timeout", patterns: [/timeout/i, /time out/i] },
  { hint: "idor", patterns: [/idor/i, /insecure direct object/i] },
  { hint: "sql_injection", patterns: [/sql injection/i] },
  { hint: "unsafe_query_builder", patterns: [/query builder/i] },
  { hint: "command_injection", patterns: [/command injection/i, /shell injection/i] },
  { hint: "permissive_cors", patterns: [/cors/i, /cross[- ]origin/i] },
  { hint: "unbounded_query", patterns: [/unbounded/i, /missing limit/i, /no pagination/i, /missing pagination/i] },
  {
    hint: "webhook_signature",
    patterns: [/webhook[^\n]*signature/i, /signature[^\n]*webhook/i]
  },
  {
    hint: "webhook_config_integrity",
    patterns: [
      /webhook[^\n]*config[^\n]*(integrity|signature|checksum|hash|hmac)/i,
      /config (integrity|signature|checksum|hash|hmac)/i,
      /config[_\s-]?(url|uri|endpoint|link)[^\n]{0,40}(integrity|signature|checksum|hash|hmac)/i
    ]
  },
  {
    hint: "sensitive_logging",
    patterns: [/sensitive log/i, /log[^\n]{0,20}(token|secret|password)/i, /plaintext log/i]
  }
];

const readEnv = (name: string): string => readConfigEnv(name) ?? "";

const resolveOpenAiApiKey = (override?: string): string => {
  if (override && override.trim()) return override.trim();
  const explicit = readEnv("HADRIX_LLM_API_KEY") || readEnv("OPENAI_API_KEY");
  if (explicit) return explicit;
  const provider = (readEnv("HADRIX_LLM_PROVIDER") || readEnv("HADRIX_PROVIDER")).toLowerCase();
  if (provider === "openai") {
    const fallback = readEnv("HADRIX_API_KEY");
    if (fallback) return fallback;
  }
  return "";
};

const resolveOpenAiBaseUrl = (override?: string): string => {
  if (override && override.trim()) return override.trim();
  const explicit = readEnv("HADRIX_LLM_BASE") || readEnv("OPENAI_API_BASE");
  if (explicit) return explicit;
  const provider = (readEnv("HADRIX_LLM_PROVIDER") || readEnv("HADRIX_PROVIDER")).toLowerCase();
  if (provider === "openai") {
    const fallback = readEnv("HADRIX_API_BASE");
    if (fallback) return fallback;
  }
  return "https://api.openai.com";
};

const resolveModel = (override?: string): string => {
  if (override && override.trim()) return override.trim();
  const llmProvider = (readEnv("HADRIX_LLM_PROVIDER") || readEnv("HADRIX_PROVIDER")).toLowerCase();
  if (llmProvider === "openai") {
    const llmModel = readEnv("HADRIX_LLM_MODEL");
    if (llmModel) return llmModel;
  }
  return DEFAULT_MODEL;
};

const safeJsonParse = (value: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const MAX_RETRY_WAIT_MS = 60_000;
const BASE_RETRY_WAIT_MS = 1_000;
const MAX_RETRY_STEP_MS = 10_000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const parseRetryAfter = (value: string | null): number | null => {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.round(seconds * 1000);
  }
  const date = Date.parse(value);
  if (!Number.isNaN(date)) {
    return Math.max(0, date - Date.now());
  }
  return null;
};

const buildRetryDelay = (attempt: number, remainingMs: number): number => {
  const exp = Math.min(BASE_RETRY_WAIT_MS * 2 ** Math.max(0, attempt - 1), MAX_RETRY_STEP_MS);
  const jitter = exp * (0.5 + Math.random());
  return Math.min(Math.max(0, Math.round(jitter)), remainingMs);
};

const annotateRetry = (error: Error, params: { retryable: boolean; status?: number; retryAfterMs?: number | null }) => {
  (error as any).retryable = params.retryable;
  if (typeof params.status === "number") {
    (error as any).status = params.status;
  }
  if (typeof params.retryAfterMs === "number") {
    (error as any).retryAfterMs = params.retryAfterMs;
  }
  return error;
};

const stripGhsaTokens = (value: string): string =>
  value.replace(/\bGHSA-[A-Za-z0-9-]+\b/gi, " ");

const normalizeText = (value: string): string =>
  stripGhsaTokens(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const ALIAS_TOKEN_RE = /\b(?:GHSA-[A-Za-z0-9-]+|CVE-\d{4}-\d{4,})\b/gi;
const PACKAGE_AT_VERSION_RE = /\b([a-z0-9_.-]+)@([0-9][^\s,)]*)\b/i;

const normalizeAliasToken = (value: string): string => value.trim().toUpperCase();
const normalizePackageName = (value: string): string => value.trim().toLowerCase();
const normalizePackageVersion = (value: string): string => value.trim().toLowerCase();

const extractPackageSpecFromText = (
  value: string
): { packageName: string; packageVersion: string } | null => {
  if (!value) return null;
  const match = value.match(PACKAGE_AT_VERSION_RE);
  if (!match) return null;
  return {
    packageName: match[1]?.trim() ?? "",
    packageVersion: match[2]?.trim() ?? "",
  };
};

const tokenSet = (value: string): Set<string> => {
  const tokens = normalizeText(value)
    .split(" ")
    .map((token) => token.trim())
    .filter(Boolean);
  return new Set(tokens);
};

const normalizeComparisonPath = (value: string): string =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\//, "")
    .replace(/\/+$/, "");

const filepathsAlign = (expectedPath?: string | null, actualPath?: string | null): boolean => {
  if (!expectedPath || !actualPath) return false;
  const expected = normalizeComparisonPath(expectedPath);
  const actual = normalizeComparisonPath(actualPath);
  if (!expected || !actual) return false;
  return actual === expected || actual.endsWith(`/${expected}`);
};

const isShortExpectation = (value: string): boolean => {
  const normalized = normalizeText(value);
  if (!normalized) return false;
  const tokens = normalized.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.length <= SHORT_EXPECTATION_TOKEN_LIMIT;
};

const extractFileBasename = (filepath: string): string => {
  const cleaned = filepath.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!cleaned) return "";
  const parts = cleaned.split("/");
  return parts[parts.length - 1] ?? "";
};

const collectSecurityKeywordHints = (value: string): string[] => {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  const hints: string[] = [];
  const hasAnonKey =
    normalized.includes("anon key") ||
    normalized.includes("anonkey") ||
    (normalized.includes("anon") && normalized.includes("key"));
  if (hasAnonKey) {
    hints.push("anon key");
  }
  const hasServiceRole =
    normalized.includes("service role") ||
    (normalized.includes("service") && normalized.includes("role") && normalized.includes("key"));
  if (hasServiceRole) {
    hints.push("service role");
  }
  const hasServiceRoleKey =
    normalized.includes("service role key") ||
    (normalized.includes("service role") && normalized.includes("key"));
  const hasServiceRoleExposure =
    hasServiceRoleKey &&
    (normalized.includes("expos") ||
      normalized.includes("public") ||
      normalized.includes("next public") ||
      normalized.includes("nextpublic"));
  if (hasServiceRoleExposure) {
    hints.push("service role key exposure");
  }
  const hasTenantIsolation =
    normalized.includes("tenant isolation") ||
    (normalized.includes("tenant") &&
      (normalized.includes("org") || normalized.includes("orgid") || normalized.includes("org id")));
  if (hasTenantIsolation) {
    hints.push("tenant isolation");
  }
  const hasAllOrgs =
    normalized.includes("all orgs") ||
    normalized.includes("all organizations") ||
    (normalized.includes("all") &&
      (normalized.includes("orgs") || normalized.includes("organizations")));
  if (hasAllOrgs) {
    hints.push("all orgs");
  }
  const hasRawSql =
    normalized.includes("raw sql") ||
    normalized.includes("unsafe sql") ||
    (normalized.includes("sql") && normalized.includes("raw"));
  if (hasRawSql) {
    hints.push("raw sql");
  }
  const hasWebhook = normalized.includes("webhook");
  const hasIntegritySignal =
    normalized.includes("integrity") ||
    normalized.includes("signature") ||
    normalized.includes("checksum") ||
    normalized.includes("hash") ||
    normalized.includes("hmac") ||
    normalized.includes("config");
  if (hasWebhook && hasIntegritySignal) {
    hints.push("webhook integrity");
  }
  return hints;
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const collectRuleIds = (value: unknown): string[] => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim());
  }
  return [];
};

const uniqueList = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
};

const extractAliasTokens = (value: string): string[] => {
  if (!value) return [];
  const matches = value.match(ALIAS_TOKEN_RE) ?? [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const match of matches) {
    const normalized = normalizeAliasToken(match);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
};

const normalizeRuleId = (value: string): string => value.trim().toLowerCase();
const normalizeRuleIdAlias = (value: string): string => {
  const normalized = normalizeRuleId(value);
  return RULE_ID_ALIASES[normalized] ?? normalized;
};

const expandRuleIdAliases = (values: string[]): string[] => {
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  const expanded = normalized.flatMap((value) => {
    const alias = normalizeRuleIdAlias(value);
    return alias && alias !== value ? [value, alias] : [value];
  });
  return uniqueList(expanded);
};

const extractEntryPointIdentity = (actual: {
  details?: Record<string, unknown> | null;
}): string => {
  const details = (actual.details ?? {}) as Record<string, unknown>;
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
    return trimmed;
  }
  return "";
};

const extractLocationFilepath = (actual: {
  location?: Record<string, unknown> | null;
}): string => {
  const location = (actual.location ?? {}) as Record<string, unknown>;
  const raw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  return typeof raw === "string" ? raw.trim() : "";
};

const extractActualRuleIds = (actual: { details?: Record<string, unknown> | null }): string[] => {
  const details = (actual.details ?? {}) as Record<string, unknown>;
  return uniqueList([
    ...collectRuleIds(details.ruleId),
    ...collectRuleIds(details.rule_id),
    ...collectRuleIds(details.ruleID),
    ...collectRuleIds(details.mergedRuleIds),
    ...collectRuleIds(details.merged_rule_ids)
  ]);
};

const collectExpectedAliases = (expected: {
  expectation: string;
  ruleId?: string | null;
}): string[] => {
  const result = new Set<string>();
  for (const alias of extractAliasTokens(expected.expectation)) {
    result.add(alias);
  }
  if (typeof expected.ruleId === "string" && expected.ruleId.trim()) {
    for (const alias of extractAliasTokens(expected.ruleId)) {
      result.add(alias);
    }
  }
  return Array.from(result);
};

const collectActualAliases = (actual: { details?: Record<string, unknown> | null }): string[] => {
  const result = new Set<string>();
  for (const ruleId of extractActualRuleIds(actual)) {
    for (const alias of extractAliasTokens(ruleId)) {
      result.add(alias);
    }
  }
  return Array.from(result);
};

const extractExpectedPackageSpec = (expected: {
  expectation: string;
}): { packageName: string; packageVersion: string } | null => {
  const parsed = extractPackageSpecFromText(expected.expectation);
  if (!parsed || !parsed.packageName || !parsed.packageVersion) return null;
  return parsed;
};

const extractActualPackageSpec = (actual: {
  details?: Record<string, unknown> | null;
}): { packageName: string; packageVersion: string } | null => {
  const details = (actual.details ?? {}) as Record<string, unknown>;
  const packageName =
    typeof details.packageName === "string" ? details.packageName.trim() : "";
  const packageVersion =
    typeof details.packageVersion === "string" ? details.packageVersion.trim() : "";
  if (!packageName || !packageVersion) return null;
  return { packageName, packageVersion };
};

const osvPackageAliasMatch = (
  expected: { expectation: string; ruleId?: string | null },
  actual: { details?: Record<string, unknown> | null }
): boolean => {
  const expectedAliases = collectExpectedAliases(expected);
  if (expectedAliases.length === 0) return false;
  const expectedPackage = extractExpectedPackageSpec(expected);
  if (!expectedPackage) return false;
  const actualPackage = extractActualPackageSpec(actual);
  if (!actualPackage) return false;
  if (normalizePackageName(expectedPackage.packageName) !== normalizePackageName(actualPackage.packageName)) {
    return false;
  }
  if (
    normalizePackageVersion(expectedPackage.packageVersion) !==
    normalizePackageVersion(actualPackage.packageVersion)
  ) {
    return false;
  }
  const actualAliases = collectActualAliases(actual);
  if (actualAliases.length === 0) return false;
  const actualSet = new Set(actualAliases.map((alias) => normalizeAliasToken(alias)));
  return expectedAliases.some((alias) => actualSet.has(normalizeAliasToken(alias)));
};

const extractRuleHintsFromText = (value: string): string[] => {
  if (!value) return [];
  const hints: string[] = [];
  for (const rule of RULE_HINT_PATTERNS) {
    if (rule.patterns.some((pattern) => pattern.test(value))) {
      hints.push(normalizeRuleIdAlias(rule.hint));
    }
  }
  return uniqueList(hints);
};

const collectExpectedRuleHints = (expected: {
  expectation: string;
  ruleId?: string | null;
}): string[] => {
  const hints = new Set<string>();
  for (const hint of extractRuleHintsFromText(expected.expectation)) {
    hints.add(hint);
  }
  if (typeof expected.ruleId === "string" && expected.ruleId.trim()) {
    hints.add(normalizeRuleIdAlias(expected.ruleId));
  }
  return Array.from(hints);
};

const collectActualRuleHints = (actual: {
  summary?: string;
  details?: Record<string, unknown> | null;
}): string[] => {
  const details = (actual.details ?? {}) as Record<string, unknown>;
  const hints = new Set<string>();
  for (const ruleId of extractActualRuleIds(actual)) {
    hints.add(normalizeRuleIdAlias(ruleId));
  }
  const candidateType = details.candidateType ?? details.candidate_type ?? null;
  if (typeof candidateType === "string" && candidateType.trim()) {
    hints.add(normalizeRuleIdAlias(candidateType));
  }
  for (const hint of extractRuleHintsFromText(actual.summary ?? "")) {
    hints.add(hint);
  }
  return Array.from(hints);
};

const ruleHintsAgree = (expectedHints: string[], actualHints: string[]): boolean => {
  if (expectedHints.length === 0 || actualHints.length === 0) {
    return false;
  }
  const expectedSet = new Set(expectedHints.map((hint) => normalizeRuleIdAlias(hint)));
  return actualHints.some((hint) => expectedSet.has(normalizeRuleIdAlias(hint)));
};

const hasRuleHintConflict = (expectedHints: string[], actualHints: string[]): boolean => {
  if (expectedHints.length === 0 || actualHints.length === 0) {
    return false;
  }
  const expectedSet = new Set(expectedHints.map((hint) => normalizeRuleIdAlias(hint)));
  for (const hint of actualHints) {
    if (expectedSet.has(normalizeRuleIdAlias(hint))) {
      return false;
    }
  }
  return true;
};

const isCorsAllowAllExpectation = (expectation: string): boolean => {
  if (!expectation) return false;
  const normalized = normalizeText(expectation);
  if (!normalized.includes("cors")) return false;
  return (
    normalized.includes("allow all") ||
    normalized.includes("allowall") ||
    normalized.includes("any origin") ||
    normalized.includes("wildcard")
  );
};

const buildExpectedComparisonText = (expected: {
  expectation: string;
  ruleId?: string | null;
  filepath?: string | null;
}): string => {
  const parts = [expected.expectation];
  if (typeof expected.filepath === "string" && expected.filepath.trim()) {
    parts.push(expected.filepath.trim());
  }
  const hasRuleId = typeof expected.ruleId === "string" && expected.ruleId.trim().length > 0;
  if (hasRuleId) {
    parts.push(...expandRuleIdAliases([expected.ruleId as string]));
  }
  if (!hasRuleId && typeof expected.filepath === "string" && expected.filepath.trim()) {
    const basename = extractFileBasename(expected.filepath);
    if (basename) {
      parts.push(basename);
    }
  }
  const context = [
    expected.expectation,
    typeof expected.ruleId === "string" ? expected.ruleId : "",
    typeof expected.filepath === "string" ? expected.filepath : ""
  ].join(" ");
  parts.push(...collectSecurityKeywordHints(context));
  parts.push(...collectExpectedRuleHints(expected));
  return uniqueList(parts.filter(Boolean)).join(" ");
};

const buildActualComparisonText = (actual: {
  summary?: string;
  details?: Record<string, unknown> | null;
  location?: Record<string, unknown> | null;
}): string => {
  const parts = [actual.summary ?? ""];
  const ruleIds = extractActualRuleIds(actual);
  const hasRuleIds = ruleIds.length > 0;
  if (hasRuleIds) {
    parts.push(...expandRuleIdAliases(ruleIds));
  }
  const entryPoint = extractEntryPointIdentity(actual);
  if (entryPoint) {
    parts.push(entryPoint);
  }
  const filepath = extractLocationFilepath(actual);
  if (filepath) {
    parts.push(filepath);
    if (!hasRuleIds) {
      const basename = extractFileBasename(filepath);
      if (basename) {
        parts.push(basename);
      }
    }
  }
  const context = [actual.summary ?? "", filepath, ...ruleIds].join(" ");
  parts.push(...collectSecurityKeywordHints(context));
  parts.push(...collectActualRuleHints(actual));
  return uniqueList(parts.filter(Boolean)).join(" ");
};

const ruleIdMatches = (
  expected: { ruleId?: string | null },
  actual: { details?: Record<string, unknown> | null }
): boolean => {
  const expectedRuleId =
    typeof expected.ruleId === "string" ? normalizeRuleIdAlias(expected.ruleId) : "";
  if (!expectedRuleId) return false;
  const actualRuleIds = extractActualRuleIds(actual).map((ruleId) => normalizeRuleIdAlias(ruleId));
  return actualRuleIds.includes(expectedRuleId);
};

export function createOpenAiSummaryComparator(options?: {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
}): SummaryComparator {
  const apiKey = resolveOpenAiApiKey(options?.apiKey);
  if (!apiKey) {
    throw new Error(
      "Missing OpenAI API key for eval comparator. Set HADRIX_LLM_API_KEY or OPENAI_API_KEY (or use HADRIX_API_KEY when HADRIX_PROVIDER=openai)."
    );
  }
  const baseUrl = resolveOpenAiBaseUrl(options?.baseUrl).replace(/\/+$/, "");
  const model = resolveModel(options?.model);
  const timeoutMs = options?.timeoutMs && Number.isFinite(options.timeoutMs)
    ? Math.max(1000, Math.trunc(options.timeoutMs))
    : DEFAULT_TIMEOUT_MS;
  const supportsTemperature = !model.toLowerCase().startsWith("gpt-5-");

  return async ({ expected, actual }): Promise<SummaryComparison> => {
    if (osvPackageAliasMatch(expected, actual)) {
      return {
        match: true,
        score: 1,
        rationale: "osv_package_alias_match",
      };
    }
    const expectedHints = collectExpectedRuleHints(expected);
    const actualHints = collectActualRuleHints(actual);
    const hintConflict = hasRuleHintConflict(expectedHints, actualHints);

    const fallback = (): SummaryComparison => {
      if (hintConflict) {
        return { match: false, score: 0, rationale: "rule_hint_conflict" };
      }
      if (ruleIdMatches(expected, actual)) {
        return {
          match: true,
          score: 1,
          rationale: "rule_id_fallback",
        };
      }
      const actualFilepath = extractLocationFilepath(actual);
      const expectedHasCorsAllowAll = isCorsAllowAllExpectation(expected.expectation);
      const actualCorsHint = actualHints
        .map((hint) => normalizeRuleIdAlias(hint))
        .includes("permissive_cors");
      if (expectedHasCorsAllowAll && actualCorsHint && filepathsAlign(expected.filepath, actualFilepath)) {
        return {
          match: true,
          score: 1,
          rationale: "cors_allow_all_filepath_match",
        };
      }
      const shortExpectation = isShortExpectation(expected.expectation);
      const threshold =
        shortExpectation && ruleHintsAgree(expectedHints, actualHints)
          ? SHORT_FALLBACK_THRESHOLD
          : FALLBACK_THRESHOLD;
      const score = jaccard(
        tokenSet(buildExpectedComparisonText(expected)),
        tokenSet(buildActualComparisonText(actual))
      );
      return {
        match: score >= threshold,
        score,
        rationale: threshold === SHORT_FALLBACK_THRESHOLD
          ? "token_jaccard_short_fallback"
          : "token_jaccard_fallback",
      };
    };

    if (hintConflict) {
      return fallback();
    }

    const requestUrl = `${baseUrl}/v1/chat/completions`;
    let attempt = 0;
    let waitedMs = 0;

    while (true) {
      attempt += 1;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(requestUrl, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            response_format: { type: "json_object" },
            ...(supportsTemperature ? { temperature: 0 } : {}),
            messages: [
              {
                role: "system",
                content: [
                  "You are an evaluation judge for security scan results.",
                  "Determine whether an actual finding summary matches an expected security issue/fix description.",
                  "The expected expectation and actual summary may not precisely match but should describe the same security issue.",
                  "Even if the expected and actual summary do not match exactly, if they describe the same security issue, the match should be true.",
                  "The expected text may describe the issue, the fix, or both.",
                  "Rule/category hints may be provided; if they conflict between expected and actual, the match should be false.",
                  "Return ONLY valid JSON with keys: match (boolean), score (0-1 number), rationale (string).",
                ].join("\n"),
              },
              {
                role: "user",
                content: JSON.stringify({
                  expected: {
                    id: expected.id ?? null,
                    filepath: expected.filepath,
                    expectation: expected.expectation,
                    severity: expected.severity ?? null,
                    source: expected.source ?? null,
                    ruleId: expected.ruleId ?? null,
                    ruleHints: expectedHints,
                  },
                  actual: {
                    id: actual.id,
                    summary: actual.summary,
                    severity: actual.severity ?? null,
                    source: actual.source ?? null,
                    location: actual.location ?? null,
                    ruleHints: actualHints,
                    details: {
                      ruleId:
                        typeof actual.details?.ruleId === "string"
                          ? actual.details.ruleId
                          : null,
                      mergedRuleIds:
                        Array.isArray(actual.details?.mergedRuleIds)
                          ? actual.details?.mergedRuleIds
                          : null,
                      tool:
                        typeof actual.details?.tool === "string"
                          ? actual.details.tool
                          : null,
                    },
                  },
                }),
              },
            ],
          }),
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") ?? "";
        const rawText = await response.text();
        const preview = rawText.trim().replace(/\s+/g, " ").slice(0, 200);
        const payload = safeJsonParse(rawText) as {
          choices?: Array<{ message?: { content?: string } }>;
          error?: { message?: string };
        } | null;

        if (!response.ok) {
          const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
          const message =
            (payload && payload.error?.message) ||
            `OpenAI request failed with status ${response.status}. ` +
              `content-type=${contentType || "unknown"}. ` +
              (preview ? `body_preview="${preview}". ` : "") +
              `Check HADRIX_LLM_BASE/OPENAI_API_BASE or network proxies.`;
          throw annotateRetry(
            new Error(message),
            {
              retryable: RETRYABLE_STATUS.has(response.status),
              status: response.status,
              retryAfterMs
            }
          );
        }

        if (!payload || typeof payload !== "object") {
          throw annotateRetry(
            new Error(
              `OpenAI response was not valid JSON (status ${response.status}, content-type=${contentType || "unknown"}). ` +
                (preview ? `body_preview="${preview}". ` : "") +
                `Check HADRIX_LLM_BASE/OPENAI_API_BASE or network proxies.`
            ),
            { retryable: false, status: response.status }
          );
        }

        const content = payload.choices?.[0]?.message?.content ?? "";
        const parsed = safeJsonParse(content);
        if (!parsed) {
          return fallback();
        }

        const match = parsed.match === true;
        const scoreRaw = parsed.score;
        const score =
          typeof scoreRaw === "number" && Number.isFinite(scoreRaw)
            ? Math.max(0, Math.min(1, scoreRaw))
            : 0;
        const rationale =
          typeof parsed.rationale === "string"
            ? parsed.rationale
            : "openai_no_rationale";

        return { match, score, rationale };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        const retryable =
          Boolean((error as any).retryable) ||
          error.name === "AbortError" ||
          error.name === "TypeError";
        if (!retryable) {
          throw error;
        }
        const remaining = MAX_RETRY_WAIT_MS - waitedMs;
        if (remaining <= 0) {
          throw error;
        }
        const retryAfterMs =
          typeof (error as any).retryAfterMs === "number" ? (error as any).retryAfterMs : null;
        const delay = retryAfterMs != null
          ? Math.min(Math.max(0, Math.round(retryAfterMs)), remaining)
          : buildRetryDelay(attempt, remaining);
        if (delay <= 0) {
          throw error;
        }
        await sleep(delay);
        waitedMs += delay;
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}
