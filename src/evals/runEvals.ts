import path from "node:path";
import { mkdir, stat, writeFile } from "node:fs/promises";
import fg from "fast-glob";
import pc from "picocolors";
import { readEnv } from "../config/env.js";
import { enableFastMode } from "../config/fastMode.js";
import { runScan } from "../scan/runScan.js";
import { buildFindingIdentityKey } from "../scan/dedupeKey.js";
import type { CoreFinding, ScanResult } from "../types.js";
import { evaluateRepoSpec, normalizeExpectedFindings } from "./evaluator.js";
import { createOpenAiSummaryComparator } from "./openAiComparator.js";
import { ALL_EVAL_SPECS } from "./specs.js";
import type {
  EvalFinding,
  EvalGroupResult,
  EvalGroupSpec,
  EvalRepoSpec,
  ExpectedFinding
} from "./types.js";

const DEFAULT_EVAL_DIR = "evals";
const DEFAULT_SUMMARY_MATCH_THRESHOLD = 0.45;
const DEFAULT_SHORT_CIRCUIT_THRESHOLD = 0.85;

export type EvalGroupStatus = "pass" | "fail" | "skipped";

export type EvalGroupRun = {
  groupId: string;
  description?: string;
  status: EvalGroupStatus;
  allowUnexpected?: boolean;
  expected: ExpectedFinding[];
  matched: EvalGroupResult["matched"];
  missing: EvalGroupResult["missing"];
  unexpected: EvalGroupResult["unexpected"];
  skipReason?: string;
};

export type EvalSpecRun = {
  specId: string;
  repoFullName: string;
  repoUrl?: string;
  repoPath: string;
  status: "pass" | "fail" | "skipped";
  groups: EvalGroupRun[];
  counts: EvalCounts;
  durationMs: number;
};

export type EvalCounts = {
  expected: number;
  matched: number;
  missing: number;
  unexpected: number;
};

export type RunEvalsResult = {
  pass: boolean;
  counts: EvalCounts;
  specs: EvalSpecRun[];
  durationMs: number;
};

export interface RunEvalsOptions {
  fixturesDir?: string | null;
  specId?: string | null;
  groupId?: string | null;
  repo?: string | null;
  repoPath?: string | null;
  inferRepoPath?: boolean;
  configPath?: string | null;
  summaryMatchThreshold?: number;
  comparisonConcurrency?: number;
  shortCircuitThreshold?: number;
  output?: "text" | "json";
  outDir?: string | null;
  skipStatic?: boolean;
  fast?: boolean;
  debug?: boolean;
  debugLogPath?: string | null;
  logger?: (message: string) => void;
}

const emptyCounts = (): EvalCounts => ({ expected: 0, matched: 0, missing: 0, unexpected: 0 });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const hash32 = (value: string): string => {
  let hash = 5381;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) + hash) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
};

const resolveFixturesDir = (options: RunEvalsOptions): string => {
  const fromEnv = readEnv("HADRIX_EVALS_DIR");
  const raw = options.fixturesDir ?? fromEnv ?? DEFAULT_EVAL_DIR;
  return path.resolve(process.cwd(), raw);
};

const repoNameFromFullName = (repoFullName: string): string => {
  const parts = repoFullName.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? repoFullName;
};

const resolveRepoPath = (spec: EvalRepoSpec, options: RunEvalsOptions): string => {
  if (options.repo) {
    return path.resolve(process.cwd(), options.repo);
  }
  const fixturesDir = resolveFixturesDir(options);
  const repoName = repoNameFromFullName(spec.repoFullName);
  return path.join(fixturesDir, repoName);
};

const buildEvalFindingId = (finding: CoreFinding, index: number): string => {
  const details = isRecord(finding.details) ? finding.details : {};
  const existingId =
    typeof details.identityKey === "string"
      ? details.identityKey
      : typeof details.identity_key === "string"
        ? details.identity_key
        : "";
  if (existingId) return existingId;
  const built = buildFindingIdentityKey({
    summary: finding.summary,
    type: finding.type,
    category: finding.category ?? null,
    source: finding.source ?? null,
    location: finding.location ?? null,
    details,
  });
  if (built) return built;
  const locationKey = JSON.stringify(finding.location ?? {});
  return `auto:${hash32(`${finding.summary}|${locationKey}`)}:${index}`;
};

const toEvalFindings = (scanResult: ScanResult): EvalFinding[] => {
  const coreFindings = [
    ...(scanResult.coreFindings ?? []),
    ...(scanResult.coreCompositeFindings ?? []),
  ];
  if (coreFindings.length === 0) {
    return scanResult.findings.map((finding, index) => ({
      id: `fallback:${index}`,
      type: null,
      source: finding.source,
      severity: finding.severity,
      category: null,
      summary: [finding.title, finding.description].filter(Boolean).join(" - "),
      location: finding.location,
      details: {},
    }));
  }
  return coreFindings.map((finding, index) => ({
    id: buildEvalFindingId(finding, index),
    type: finding.type ?? null,
    source: finding.source ?? null,
    severity: finding.severity,
    category: finding.category ?? null,
    summary: finding.summary ?? "",
    location: finding.location ?? null,
    details: finding.details ?? {},
  }));
};

const matchesGroup = (group: EvalGroupSpec, groupId?: string | null): boolean => {
  const normalized = groupId?.trim();
  if (!normalized || normalized === "all") return true;
  return group.id === normalized;
};

const matchesSpec = (spec: EvalRepoSpec, specId?: string | null): boolean => {
  const normalized = specId?.trim();
  if (!normalized || normalized === "all") return true;
  return spec.id === normalized || spec.repoFullName === normalized;
};

const shouldSkipGroup = (_group: EvalGroupSpec): string | null => null;

const findSupabaseSchemaSnapshot = async (repoPath: string): Promise<string | null> => {
  const patterns = [
    "**/datastores/supabase/*/schema.json",
    "datastores/supabase/*/schema.json",
    "datastores/supabase/schema.json",
    "supabase/schema.json"
  ];
  const matches = await fg(patterns, { cwd: repoPath, absolute: true, onlyFiles: true });
  return matches[0] ?? null;
};

const ensureRepoExists = async (repoPath: string): Promise<void> => {
  const stats = await stat(repoPath).catch(() => null);
  if (!stats || !stats.isDirectory()) {
    throw new Error(`Eval repo not found: ${repoPath}`);
  }
};

const mergeCounts = (target: EvalCounts, source: EvalCounts): void => {
  target.expected += source.expected;
  target.matched += source.matched;
  target.missing += source.missing;
  target.unexpected += source.unexpected;
};

const countsFromGroup = (group: EvalGroupRun): EvalCounts => {
  if (group.status === "skipped") return emptyCounts();
  return {
    expected: group.matched.length + group.missing.length,
    matched: group.matched.length,
    missing: group.missing.length,
    unexpected: group.unexpected.length,
  };
};

const countsFromGroups = (groups: EvalGroupRun[]): EvalCounts => {
  const counts = emptyCounts();
  for (const group of groups) {
    mergeCounts(counts, countsFromGroup(group));
  }
  return counts;
};

const groupStatus = (pass: boolean): "pass" | "fail" => (pass ? "pass" : "fail");

const buildSpecResult = (params: {
  spec: EvalRepoSpec;
  repoPath: string;
  selectedGroups: EvalGroupSpec[];
  skippedReasons: Map<string, string>;
  evalResults: EvalGroupResult[];
  durationMs: number;
}): EvalSpecRun => {
  const resultsById = new Map(params.evalResults.map((result) => [result.groupId, result]));
  const groups: EvalGroupRun[] = params.selectedGroups.map((group) => {
    const expected = normalizeExpectedFindings(group.expectedFindings);
    const skipReason = params.skippedReasons.get(group.id);
    if (skipReason) {
      return {
        groupId: group.id,
        description: group.description,
        status: "skipped",
        allowUnexpected: group.allowUnexpected,
        expected,
        matched: [],
        missing: [],
        unexpected: [],
        skipReason,
      };
    }
    const result = resultsById.get(group.id);
    if (!result) {
      return {
        groupId: group.id,
        description: group.description,
        status: "skipped",
        allowUnexpected: group.allowUnexpected,
        expected,
        matched: [],
        missing: [],
        unexpected: [],
        skipReason: "no eval result",
      };
    }
    return {
      groupId: group.id,
      description: group.description,
      status: groupStatus(result.pass),
      allowUnexpected: group.allowUnexpected,
      expected,
      matched: result.matched,
      missing: result.missing,
      unexpected: result.unexpected,
    };
  });

  const counts = countsFromGroups(groups);
  const failed = groups.some((group) => group.status === "fail");
  const allSkipped = groups.every((group) => group.status === "skipped");
  return {
    specId: params.spec.id ?? params.spec.repoFullName,
    repoFullName: params.spec.repoFullName,
    repoUrl: params.spec.repoUrl,
    repoPath: params.repoPath,
    status: allSkipped ? "skipped" : failed ? "fail" : "pass",
    groups,
    counts,
    durationMs: params.durationMs,
  };
};

export function formatEvalsText(result: RunEvalsResult): string {
  const lines: string[] = [];
  const headerStatus = result.pass ? pc.green("PASS") : pc.red("FAIL");
  lines.push(`${pc.bold("Hadrix evals")}: ${headerStatus}`);
  lines.push(
    `Total: expected=${result.counts.expected} matched=${result.counts.matched} missing=${result.counts.missing} unexpected=${result.counts.unexpected} (${(result.durationMs / 1000).toFixed(1)}s)`
  );

  for (const spec of result.specs) {
    const specMark =
      spec.status === "pass" ? "✅" : spec.status === "fail" ? "❌" : "➖";
    const specLabel =
      spec.status === "pass" ? pc.green("PASS") : spec.status === "fail" ? pc.red("FAIL") : pc.yellow("SKIP");
    lines.push("");
    lines.push(`${specMark} ${specLabel} ${spec.specId} (${spec.repoFullName})`);
    lines.push(
      `  expected=${spec.counts.expected} matched=${spec.counts.matched} missing=${spec.counts.missing} unexpected=${spec.counts.unexpected} (${(spec.durationMs / 1000).toFixed(1)}s)`
    );

    for (const group of spec.groups) {
      const groupMark =
        group.status === "pass"
          ? "✅"
          : group.status === "fail"
            ? "❌"
            : "➖";
      const groupLabel =
        group.status === "pass"
          ? pc.green("PASS")
          : group.status === "fail"
            ? pc.red("FAIL")
            : pc.yellow("SKIP");
      const base = `  ${groupMark} ${groupLabel} ${group.groupId}`;
      if (group.status === "skipped") {
        lines.push(`${base} (${group.skipReason ?? "skipped"})`);
        const skippedMark = "➖";
        for (const expected of group.expected) {
          const suffix = expected.ruleId ? ` (${expected.ruleId})` : "";
          lines.push(`    ${skippedMark} ${expected.filepath}: ${expected.expectation}${suffix}`);
        }
        continue;
      }
      lines.push(
        `${base} matched=${group.matched.length} missing=${group.missing.length} unexpected=${group.unexpected.length}`
      );
      const matchedById = new Map(group.matched.map((match) => [match.expected.id, match]));
      const missingIds = new Set(group.missing.map((missing) => missing.id));
      for (const expected of group.expected) {
        const id = expected.id ?? "";
        const isMissing = id ? missingIds.has(id) : false;
        const isMatched = id ? matchedById.has(id) : !isMissing;
        const mark = isMatched ? "✅" : "❌";
        const suffix = expected.ruleId ? ` (${expected.ruleId})` : "";
        lines.push(`    ${mark} ${expected.filepath}: ${expected.expectation}${suffix}`);
      }
    }
  }

  return lines.join("\n");
}

export function formatEvalsSummaryMarkdown(result: RunEvalsResult): string {
  const lines: string[] = [];
  lines.push("# Hadrix evals");
  lines.push("");
  lines.push(`- result: ${result.pass ? "pass" : "fail"}`);
  lines.push(
    `- totals: expected=${result.counts.expected}, matched=${result.counts.matched}, missing=${result.counts.missing}, unexpected=${result.counts.unexpected}`
  );
  lines.push(`- duration: ${(result.durationMs / 1000).toFixed(1)}s`);

  for (const spec of result.specs) {
    lines.push("");
    lines.push(`## ${spec.specId}`);
    lines.push(`- repo: ${spec.repoFullName}`);
    lines.push(`- status: ${spec.status}`);
    lines.push(
      `- counts: expected=${spec.counts.expected}, matched=${spec.counts.matched}, missing=${spec.counts.missing}, unexpected=${spec.counts.unexpected}`
    );
    lines.push(`- duration: ${(spec.durationMs / 1000).toFixed(1)}s`);

    for (const group of spec.groups) {
      lines.push("");
      lines.push(`### ${group.groupId}`);
      lines.push(`- status: ${group.status}`);
      if (group.status === "skipped") {
        lines.push(`- reason: ${group.skipReason ?? "skipped"}`);
      }
      lines.push(
        `- matched=${group.matched.length} missing=${group.missing.length} unexpected=${group.unexpected.length}`
      );
      const matchedById = new Map(group.matched.map((match) => [match.expected.id, match]));
      const missingIds = new Set(group.missing.map((missing) => missing.id));
      lines.push("- cases:");
      for (const expected of group.expected) {
        const id = expected.id ?? "";
        const isMissing = id ? missingIds.has(id) : false;
        const isMatched = id ? matchedById.has(id) : !isMissing;
        const checkbox = group.status === "skipped" ? " " : isMatched ? "x" : " ";
        const suffix = expected.ruleId ? ` (${expected.ruleId})` : "";
        lines.push(`  - [${checkbox}] ${expected.filepath}: ${expected.expectation}${suffix}`);
      }
    }
  }

  return lines.join("\n");
}

export async function runEvals(options: RunEvalsOptions = {}): Promise<RunEvalsResult> {
  const start = Date.now();
  const logger = options.logger ?? (() => {});
  if (options.fast) {
    enableFastMode();
  }
  const comparator = createOpenAiSummaryComparator();
  const specsToRun = ALL_EVAL_SPECS.filter((spec) => matchesSpec(spec, options.specId));
  if (specsToRun.length === 0) {
    throw new Error(`No eval specs matched: ${options.specId ?? "(all)"}`);
  }

  if (options.repo && specsToRun.length > 1) {
    throw new Error("--repo can only be used with a single spec (use --spec <id>).");
  }

  const specRuns: EvalSpecRun[] = [];

  for (const spec of specsToRun) {
    const specStart = Date.now();
    const repoPath = resolveRepoPath(spec, options);
    await ensureRepoExists(repoPath);

    const selectedGroups = spec.groups.filter((group) => matchesGroup(group, options.groupId));
    if (selectedGroups.length === 0) {
      throw new Error(`No eval groups matched: ${options.groupId ?? "(all)"}`);
    }

    const skippedReasons = new Map<string, string>();
    const runnableGroups: EvalGroupSpec[] = [];
    for (const group of selectedGroups) {
      const reason = shouldSkipGroup(group);
      if (reason) {
        skippedReasons.set(group.id, reason);
      } else {
        runnableGroups.push(group);
      }
    }

    let evalResults: EvalGroupResult[] = [];
    if (runnableGroups.length > 0) {
      logger(`Running scan for ${spec.repoFullName}...`);
      const resolvedConfigPath = options.configPath
        ? path.isAbsolute(options.configPath)
          ? options.configPath
          : path.join(repoPath, options.configPath)
        : null;
      const supabaseSchemaSnapshot = await findSupabaseSchemaSnapshot(repoPath);

      const scanResult = await runScan({
        projectRoot: repoPath,
        configPath: resolvedConfigPath,
        repoPath: options.repoPath ?? null,
        inferRepoPath: options.inferRepoPath,
        skipStatic: options.skipStatic,
        repoFullName: spec.repoFullName,
        logger,
        debug: options.debug,
        debugLogPath: options.debugLogPath ?? null,
        supabase: supabaseSchemaSnapshot ? { schemaSnapshotPath: supabaseSchemaSnapshot } : null,
      });

      const evalFindings = toEvalFindings(scanResult);
      const evalResponse = await evaluateRepoSpec({
        spec: { ...spec, groups: runnableGroups },
        actual: evalFindings,
        comparator,
        groupId: null,
        summaryMatchThreshold: options.summaryMatchThreshold ?? DEFAULT_SUMMARY_MATCH_THRESHOLD,
        comparisonConcurrency: options.comparisonConcurrency,
        shortCircuitThreshold: options.shortCircuitThreshold ?? DEFAULT_SHORT_CIRCUIT_THRESHOLD,
      });
      evalResults = evalResponse.groups;
    }

    specRuns.push(
      buildSpecResult({
        spec,
        repoPath,
        selectedGroups,
        skippedReasons,
        evalResults,
        durationMs: Date.now() - specStart,
      })
    );
  }

  const counts = emptyCounts();
  for (const spec of specRuns) {
    mergeCounts(counts, spec.counts);
  }

  const pass = specRuns.every((spec) => spec.status !== "fail");
  return {
    pass,
    counts,
    specs: specRuns,
    durationMs: Date.now() - start,
  };
}

export async function writeEvalArtifacts(
  result: RunEvalsResult,
  outDir: string
): Promise<{ jsonPath: string; summaryPath: string }> {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "results.json");
  const summaryPath = path.join(outDir, "summary.md");
  await writeFile(jsonPath, JSON.stringify(result, null, 2));
  await writeFile(summaryPath, formatEvalsSummaryMarkdown(result));
  return { jsonPath, summaryPath };
}
