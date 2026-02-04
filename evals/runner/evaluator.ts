import type { EvalFinding, EvalGroupResult, EvalRepoSpec, ExpectedFinding, SummaryComparator, SummaryComparison } from "./types.js";
import { buildFindingIdentityKeyV2, buildIdentityKeyV2 } from "../../src/scan/dedupeKey.js";

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

const extractLocationFilepath = (finding: EvalFinding): string => {
  const location = (finding.location ?? {}) as Record<string, unknown>;
  const raw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  return typeof raw === "string" ? raw.trim() : "";
};

const extractIdentityKeyV2 = (finding: EvalFinding): string => {
  const details = (finding.details ?? {}) as Record<string, unknown>;
  const raw = (details as any).identityKeyV2 ?? (details as any).identity_key_v2;
  return typeof raw === "string" ? raw.trim() : "";
};

const buildActualIdentityKeyV2 = (finding: EvalFinding): string => {
  return (
    extractIdentityKeyV2(finding) ||
    buildFindingIdentityKeyV2(
      {
        summary: finding.summary,
        type: finding.type,
        category: finding.category ?? null,
        source: finding.source ?? null,
        location: finding.location ?? null,
        details: (finding.details ?? {}) as Record<string, unknown>,
      },
      {}
    )
  );
};

const buildExpectedIdentityKeyV2 = (expected: ExpectedFinding): string => {
  if (typeof expected.identityKeyV2 === "string" && expected.identityKeyV2.trim()) {
    return expected.identityKeyV2.trim();
  }

  const ruleId = typeof expected.ruleId === "string" ? expected.ruleId.trim() : "";
  if (!ruleId) return "";

  const anchorNodeId =
    typeof expected.anchorNodeId === "string" ? expected.anchorNodeId.trim() : "";
  const startLine =
    typeof expected.startLine === "number" && Number.isFinite(expected.startLine)
      ? Math.trunc(expected.startLine)
      : null;
  const endLine =
    typeof expected.endLine === "number" && Number.isFinite(expected.endLine)
      ? Math.trunc(expected.endLine)
      : null;

  return buildIdentityKeyV2({
    filepath: expected.filepath,
    repoPath: null,
    ruleId,
    anchorNodeId: anchorNodeId || null,
    startLine,
    endLine,
    chunkIndex: null,
  });
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

const ruleIdMatches = (expected: ExpectedFinding, actual: EvalFinding): boolean => {
  const expectedRuleId =
    typeof expected.ruleId === "string" ? normalizeRuleIdAlias(expected.ruleId) : "";
  if (!expectedRuleId) return false;
  const actualRuleIds = extractActualRuleIds(actual).map((ruleId) => normalizeRuleIdAlias(ruleId));
  return actualRuleIds.includes(expectedRuleId);
};

const defaultComparator = (): SummaryComparator => {
  return ({ expected, actual }): SummaryComparison => {
    if (osvPackageAliasMatch(expected, actual)) {
      return { match: true, score: 1, rationale: "osv_package_alias_match" };
    }
    if (ruleIdMatches(expected, actual)) {
      return { match: true, score: 1, rationale: "rule_id_match" };
    }
    return { match: false, score: 0, rationale: "no_match" };
  };
};

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
  const comparator = args.comparator ?? defaultComparator();

  const actualAll = args.actualFilter ? args.actual.filter(args.actualFilter) : args.actual;
  const expected = normalizeExpectedFindings(args.expected);

  const actualWithPath = actualAll
    .map((finding) => ({
      finding,
      filepath: extractFindingFilepath(finding),
      identityKeyV2: buildActualIdentityKeyV2(finding),
    }))
    .filter((item) => Boolean(item.filepath)) as Array<{
      finding: EvalFinding;
      filepath: string;
      identityKeyV2: string;
    }>;

  const actualByIdentityKeyV2 = new Map<string, EvalFinding[]>();
  for (const item of actualWithPath) {
    if (!item.identityKeyV2) continue;
    const existing = actualByIdentityKeyV2.get(item.identityKeyV2);
    if (existing) {
      existing.push(item.finding);
    } else {
      actualByIdentityKeyV2.set(item.identityKeyV2, [item.finding]);
    }
  }

  const usedActualIds = new Set<string>();
  const matched: EvalGroupResult["matched"] = [];
  const missing: ExpectedFinding[] = [];

  for (const exp of expected) {
    const expectedIdentityKeyV2 = buildExpectedIdentityKeyV2(exp);
    if (expectedIdentityKeyV2) {
      const candidates = actualByIdentityKeyV2.get(expectedIdentityKeyV2) ?? [];
      const match = candidates.find((candidate) => {
        if (usedActualIds.has(candidate.id)) return false;
        const candidatePath = extractFindingFilepath(candidate);
        return candidatePath ? matchFilepath(exp.filepath, candidatePath) : false;
      });
      if (!match) {
        missing.push(exp);
        continue;
      }
      usedActualIds.add(match.id);
      matched.push({
        expected: exp,
        actual: match,
        comparison: { match: true, score: 1, rationale: "identity_key_v2_match" },
      });
      continue;
    }

    const candidates = actualWithPath
      .filter((a) => matchFilepath(exp.filepath, a.filepath) && !usedActualIds.has(a.finding.id))
      .sort((a, b) => {
        const keyA = a.identityKeyV2 || "";
        const keyB = b.identityKeyV2 || "";
        const byKey = keyA.localeCompare(keyB);
        if (byKey !== 0) return byKey;
        return a.finding.id.localeCompare(b.finding.id);
      });

    let best: { finding: EvalFinding; comparison: SummaryComparison } | null = null;
    for (const candidate of candidates) {
      const comparison = await comparator({ expected: exp, actual: candidate.finding });
      if (!comparison.match) continue;
      const score = typeof comparison.score === "number" ? comparison.score : 0;
      const bestScore = best && typeof best.comparison.score === "number" ? best.comparison.score : 0;
      if (!best || score > bestScore) {
        best = { finding: candidate.finding, comparison };
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
