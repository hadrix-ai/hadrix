import type { EvalFinding, EvalGroupResult, EvalRepoSpec, ExpectedFinding, SummaryComparator, SummaryComparison } from "./types.js";

const normalizePath = (value: string): string =>
  value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^[./]+/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");

const globToRegex = (pattern: string): RegExp => {
  let out = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === "*") {
      const isDouble = pattern[i + 1] === "*";
      if (isDouble) {
        out += ".*";
        i += 1;
      } else {
        out += "[^/]*";
      }
      continue;
    }
    if (/[-/\\^$+?.()|[\]{}]/.test(ch)) {
      out += `\\${ch}`;
    } else {
      out += ch;
    }
  }
  out += "$";
  return new RegExp(out);
};

const matchFilepath = (expected: string, actual: string): boolean => {
  if (expected === actual) return true;
  if (!expected.includes("*")) return false;
  return globToRegex(expected).test(actual);
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

const hash32 = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const tokenSet = (value: string): Set<string> => {
  const tokens = normalizeText(value)
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean);
  return new Set(tokens);
};

const jaccard = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) {
    if (b.has(t)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

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

const extractEntryPointIdentity = (actual: EvalFinding): string => {
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

const extractLocationFilepath = (finding: EvalFinding): string => {
  const location = (finding.location ?? {}) as Record<string, unknown>;
  const raw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  return typeof raw === "string" ? raw.trim() : "";
};

const extractActualRuleIds = (finding: EvalFinding): string[] => {
  const details = (finding.details ?? {}) as Record<string, unknown>;
  return uniqueList([
    ...collectRuleIds(details.ruleId),
    ...collectRuleIds(details.rule_id),
    ...collectRuleIds(details.ruleID),
    ...collectRuleIds(details.mergedRuleIds),
    ...collectRuleIds(details.merged_rule_ids),
  ]);
};

const collectExpectedAliases = (expected: ExpectedFinding): string[] => {
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

const collectActualAliases = (actual: EvalFinding): string[] => {
  const result = new Set<string>();
  for (const ruleId of extractActualRuleIds(actual)) {
    for (const alias of extractAliasTokens(ruleId)) {
      result.add(alias);
    }
  }
  return Array.from(result);
};

const extractExpectedPackageSpec = (
  expected: ExpectedFinding
): { packageName: string; packageVersion: string } | null => {
  const parsed = extractPackageSpecFromText(expected.expectation);
  if (!parsed || !parsed.packageName || !parsed.packageVersion) return null;
  return parsed;
};

const extractActualPackageSpec = (
  actual: EvalFinding
): { packageName: string; packageVersion: string } | null => {
  const details = (actual.details ?? {}) as Record<string, unknown>;
  const packageName =
    typeof details.packageName === "string" ? details.packageName.trim() : "";
  const packageVersion =
    typeof details.packageVersion === "string" ? details.packageVersion.trim() : "";
  if (!packageName || !packageVersion) return null;
  return { packageName, packageVersion };
};

const osvPackageAliasMatch = (expected: ExpectedFinding, actual: EvalFinding): boolean => {
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

const collectExpectedRuleHints = (expected: ExpectedFinding): string[] => {
  const hints = new Set<string>();
  for (const hint of extractRuleHintsFromText(expected.expectation)) {
    hints.add(hint);
  }
  if (typeof expected.ruleId === "string" && expected.ruleId.trim()) {
    hints.add(normalizeRuleIdAlias(expected.ruleId));
  }
  return Array.from(hints);
};

const collectActualRuleHints = (actual: EvalFinding): string[] => {
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

const buildExpectedComparisonText = (expected: ExpectedFinding): string => {
  const parts = [expected.expectation];
  if (typeof expected.filepath === "string" && expected.filepath.trim()) {
    parts.push(expected.filepath.trim());
  }
  if (typeof expected.ruleId === "string" && expected.ruleId.trim()) {
    parts.push(...expandRuleIdAliases([expected.ruleId]));
  }
  parts.push(...collectExpectedRuleHints(expected));
  return uniqueList(parts.filter(Boolean)).join(" ");
};

const buildActualComparisonText = (actual: EvalFinding): string => {
  const parts = [actual.summary ?? ""];
  const ruleIds = extractActualRuleIds(actual);
  if (ruleIds.length > 0) {
    parts.push(...expandRuleIdAliases(ruleIds));
  }
  const entryPoint = extractEntryPointIdentity(actual);
  if (entryPoint) {
    parts.push(entryPoint);
  }
  const filepath = extractLocationFilepath(actual);
  if (filepath) {
    parts.push(filepath);
  }
  parts.push(...collectActualRuleHints(actual));
  return uniqueList(parts.filter(Boolean)).join(" ");
};

const ruleIdMatches = (expected: ExpectedFinding, actual: EvalFinding): boolean => {
  const expectedRuleId =
    typeof expected.ruleId === "string" ? normalizeRuleIdAlias(expected.ruleId) : "";
  if (!expectedRuleId) return false;
  const actualRuleIds = extractActualRuleIds(actual).map((ruleId) => normalizeRuleIdAlias(ruleId));
  return actualRuleIds.includes(expectedRuleId);
};

const defaultComparator = (threshold: number): SummaryComparator => {
  return ({ expected, actual }): SummaryComparison => {
    if (osvPackageAliasMatch(expected, actual)) {
      return {
        match: true,
        score: 1,
        rationale: "osv_package_alias_match",
      };
    }
    const expectedHints = collectExpectedRuleHints(expected);
    const actualHints = collectActualRuleHints(actual);
    if (hasRuleHintConflict(expectedHints, actualHints)) {
      return { match: false, score: 0, rationale: "rule_hint_conflict" };
    }
    if (ruleIdMatches(expected, actual)) {
      return {
        match: true,
        score: 1,
        rationale: "rule_id_match",
      };
    }
    const score = jaccard(
      tokenSet(buildExpectedComparisonText(expected)),
      tokenSet(buildActualComparisonText(actual))
    );
    return {
      match: score >= threshold,
      score,
      rationale: "token_jaccard",
    };
  };
};

const DEFAULT_COMPARISON_CONCURRENCY = 5;
const DEFAULT_SHORT_CIRCUIT_THRESHOLD = 0.85;

const normalizeComparisonConcurrency = (value?: number): number => {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return DEFAULT_COMPARISON_CONCURRENCY;
};

const normalizeShortCircuitThreshold = (value?: number): number => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.min(1, Math.max(0, value));
  }
  return DEFAULT_SHORT_CIRCUIT_THRESHOLD;
};

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  runner: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (true) {
        const current = index;
        index += 1;
        if (current >= items.length) {
          break;
        }
        results[current] = await runner(items[current]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

export const extractFindingFilepath = (finding: EvalFinding): string | null => {
  const location = (finding.location ?? {}) as Record<string, unknown>;
  const raw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  if (typeof raw === "string" && raw.trim()) {
    return normalizePath(raw);
  }
  return null;
};

export const normalizeExpectedFindings = (expected: ExpectedFinding[]): ExpectedFinding[] => {
  return expected.map((item, idx) => {
    const filepath = normalizePath(item.filepath);
    const idRaw = typeof item.id === "string" ? item.id.trim() : "";
    const stable =
      idRaw ||
      `auto:${filepath}:${hash32(`${filepath}|${item.startLine ?? ""}|${item.endLine ?? ""}|${normalizeText(item.expectation)}`)}:${idx + 1}`;
    return { ...item, id: stable, filepath };
  });
};

export async function evaluateFindingsGroup(args: {
  repoFullName: string;
  groupId: string;
  expected: ExpectedFinding[];
  actual: EvalFinding[];
  allowUnexpected?: boolean;
  comparator?: SummaryComparator;
  summaryMatchThreshold?: number;
  comparisonConcurrency?: number;
  shortCircuitThreshold?: number;
  actualFilter?: (finding: EvalFinding) => boolean;
}): Promise<EvalGroupResult> {
  const comparator = args.comparator ?? defaultComparator(args.summaryMatchThreshold ?? 0.47);
  const comparisonConcurrency = normalizeComparisonConcurrency(args.comparisonConcurrency);
  const shortCircuitThreshold = normalizeShortCircuitThreshold(args.shortCircuitThreshold);

  const actualAll = args.actualFilter ? args.actual.filter(args.actualFilter) : args.actual;
  const expected = normalizeExpectedFindings(args.expected);

  const actualWithPath = actualAll
    .map((finding) => ({ finding, filepath: extractFindingFilepath(finding) }))
    .filter((item) => Boolean(item.filepath)) as Array<{ finding: EvalFinding; filepath: string }>;

  const usedActualIds = new Set<string>();
  const matched: EvalGroupResult["matched"] = [];
  const missing: ExpectedFinding[] = [];

  for (const exp of expected) {
    const candidates = actualWithPath
      .filter((a) => matchFilepath(exp.filepath, a.filepath) && !usedActualIds.has(a.finding.id))
      .map((a) => a.finding);
    const expectedHints = collectExpectedRuleHints(exp);
    const filteredCandidates = candidates.filter(
      (candidate) => !hasRuleHintConflict(expectedHints, collectActualRuleHints(candidate))
    );

    let best: { finding: EvalFinding; comparison: SummaryComparison } | null = null;
    if (filteredCandidates.length > 0) {
      const expectedTokens = tokenSet(buildExpectedComparisonText(exp));
      let bestShort: { candidate: EvalFinding; score: number; rationale: string } | null = null;
      for (const candidate of filteredCandidates) {
        if (osvPackageAliasMatch(exp, candidate)) {
          bestShort = { candidate, score: 1, rationale: "osv_package_alias_match" };
          break;
        }
        if (ruleIdMatches(exp, candidate)) {
          bestShort = { candidate, score: 1, rationale: "rule_id_short_circuit" };
          break;
        }
        const score = jaccard(expectedTokens, tokenSet(buildActualComparisonText(candidate)));
        if (!bestShort || score > bestShort.score) {
          bestShort = { candidate, score, rationale: "token_jaccard_short_circuit" };
        }
      }
      if (bestShort && bestShort.score >= shortCircuitThreshold) {
        best = {
          finding: bestShort.candidate,
          comparison: {
            match: true,
            score: bestShort.score,
            rationale: bestShort.rationale,
          },
        };
      } else {
        const comparisons = await runWithConcurrency(
          filteredCandidates,
          comparisonConcurrency,
          async (candidate) => ({
            candidate,
            comparison: await comparator({ expected: exp, actual: candidate }),
          })
        );
        for (const { candidate, comparison } of comparisons) {
          if (!comparison.match) continue;
          const score = typeof comparison.score === "number" ? comparison.score : 0;
          const bestScore = best && typeof best.comparison.score === "number" ? best.comparison.score : 0;
          if (!best || score > bestScore) {
            best = { finding: candidate, comparison };
          }
        }
      }
    }

    if (!best) {
      missing.push(exp);
      continue;
    }

    usedActualIds.add(best.finding.id);
    matched.push({ expected: exp, actual: best.finding, comparison: best.comparison });
  }

  const unexpected = actualAll.filter((finding) => !usedActualIds.has(finding.id));
  const pass = missing.length === 0 && (args.allowUnexpected === true || unexpected.length === 0);

  return {
    repoFullName: args.repoFullName,
    groupId: args.groupId,
    matched,
    missing,
    unexpected,
    pass,
  };
}

export async function evaluateRepoSpec(args: {
  spec: EvalRepoSpec;
  actual: EvalFinding[];
  comparator?: SummaryComparator;
  summaryMatchThreshold?: number;
  groupId?: string | null;
  allowUnexpected?: boolean;
  comparisonConcurrency?: number;
  shortCircuitThreshold?: number;
}): Promise<{ repoFullName: string; pass: boolean; groups: EvalGroupResult[] }> {
  const spec = args.spec;
  const groupId = args.groupId?.trim() || null;
  const groupsToRun =
    !groupId || groupId === "all" ? spec.groups : spec.groups.filter((g) => g.id === groupId);

  const results: EvalGroupResult[] = [];
  for (const group of groupsToRun) {
    results.push(
      await evaluateFindingsGroup({
        repoFullName: spec.repoFullName,
        groupId: group.id,
        expected: group.expectedFindings,
        actual: args.actual,
        allowUnexpected: args.allowUnexpected ?? group.allowUnexpected,
        comparator: group.comparator ?? args.comparator,
        summaryMatchThreshold: args.summaryMatchThreshold,
        comparisonConcurrency: args.comparisonConcurrency,
        shortCircuitThreshold: args.shortCircuitThreshold,
        actualFilter: group.actualFilter,
      })
    );
  }

  return {
    repoFullName: spec.repoFullName,
    pass: results.every((r) => r.pass),
    groups: results,
  };
}
