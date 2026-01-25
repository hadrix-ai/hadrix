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

const normalizeText = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

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

const normalizeRuleId = (value: string): string => value.trim().toLowerCase();

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

const buildExpectedComparisonText = (expected: ExpectedFinding): string => {
  const parts = [expected.expectation];
  if (typeof expected.ruleId === "string" && expected.ruleId.trim()) {
    parts.push(expected.ruleId.trim());
  }
  return parts.filter(Boolean).join(" ");
};

const buildActualComparisonText = (actual: EvalFinding): string => {
  const parts = [actual.summary ?? ""];
  for (const ruleId of extractActualRuleIds(actual)) {
    parts.push(ruleId);
  }
  return parts.filter(Boolean).join(" ");
};

const ruleIdMatches = (expected: ExpectedFinding, actual: EvalFinding): boolean => {
  const expectedRuleId =
    typeof expected.ruleId === "string" ? normalizeRuleId(expected.ruleId) : "";
  if (!expectedRuleId) return false;
  const actualRuleIds = extractActualRuleIds(actual).map((ruleId) => normalizeRuleId(ruleId));
  return actualRuleIds.includes(expectedRuleId);
};

const defaultComparator = (threshold: number): SummaryComparator => {
  return ({ expected, actual }): SummaryComparison => {
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
const DEFAULT_SHORT_CIRCUIT_THRESHOLD = 0.8;

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
  const comparator = args.comparator ?? defaultComparator(args.summaryMatchThreshold ?? 0.4);
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

    let best: { finding: EvalFinding; comparison: SummaryComparison } | null = null;
    if (candidates.length > 0) {
      const expectedTokens = tokenSet(buildExpectedComparisonText(exp));
      let bestShort: { candidate: EvalFinding; score: number; rationale: string } | null = null;
      for (const candidate of candidates) {
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
        const comparisons = await runWithConcurrency(candidates, comparisonConcurrency, async (candidate) => ({
          candidate,
          comparison: await comparator({ expected: exp, actual: candidate }),
        }));
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
