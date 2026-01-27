import pc from "picocolors";
import type { CoreScanResult, Finding, ScanResult } from "../types.js";

function severityLabel(severity: Finding["severity"]): string {
  switch (severity) {
    case "critical":
      return pc.bgRed(pc.white(" CRITICAL "));
    case "high":
      return pc.red("HIGH");
    case "medium":
      return pc.yellow("MEDIUM");
    case "info":
      return pc.blue("INFO");
    case "low":
    default:
      return pc.green("LOW");
  }
}

function resolveFindingFilepath(finding: Finding): string {
  const repoPath = finding.location.repoPath;
  const filepath =
    repoPath &&
    finding.location.filepath &&
    !finding.location.filepath.startsWith(`${repoPath}/`) &&
    finding.location.filepath !== repoPath
      ? `${repoPath}/${finding.location.filepath}`.replace(/\/+/g, "/")
      : finding.location.filepath;
  return filepath;
}

function formatFinding(finding: Finding): string {
  const filepath = resolveFindingFilepath(finding);
  const location = `${filepath}:${finding.location.startLine}`;
  const lines: string[] = [];
  const sourceLabel = finding.source === "static" ? pc.cyan("STATIC") : pc.magenta("LLM");
  lines.push(`${severityLabel(finding.severity)} ${sourceLabel} ${finding.title}`);
  lines.push(`  at ${location}`);
  if (finding.description) lines.push(`  ${finding.description}`);
  if (finding.evidence) lines.push(`  evidence: ${finding.evidence}`);
  if (finding.remediation) lines.push(`  remediation: ${finding.remediation}`);
  return lines.join("\n");
}

type GroupedFinding = {
  key: string;
  representative: Finding;
  locations: Array<{ location: string; filepath: string; line: number }>;
};

function normalizeGroupTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    // Strip trailing punctuation that often varies across otherwise-identical titles.
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function severityRank(severity: Finding["severity"]): number {
  switch (severity) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
    default:
      return 1;
  }
}

function sourceRank(source: Finding["source"]): number {
  // Prefer static findings first, then LLM.
  return source === "static" ? 0 : 1;
}

function formatGroupedFinding(group: GroupedFinding): string {
  const finding = group.representative;
  const lines: string[] = [];
  const sourceLabel = finding.source === "static" ? pc.cyan("STATIC") : pc.magenta("LLM");

  lines.push(`${severityLabel(finding.severity)} ${sourceLabel} ${finding.title}`);

  const orderedLocations = group.locations
    .slice()
    .sort((a, b) => a.filepath.localeCompare(b.filepath) || a.line - b.line)
    .map((entry) => entry.location);

  lines.push(`  affected locations (${orderedLocations.length}):`);
  for (const loc of orderedLocations) {
    lines.push(`  - ${loc}`);
  }

  if (finding.description) lines.push(`  ${finding.description}`);
  if (finding.evidence) lines.push(`  evidence: ${finding.evidence}`);
  if (finding.remediation) lines.push(`  remediation: ${finding.remediation}`);

  return lines.join("\n");
}

export function formatFindingsText(findings: Finding[]): string {
  if (!findings.length) {
    return "No findings.";
  }

  // Group only for text output; JSON outputs remain unchanged.
  // Grouping strategy (Option B): severity + source + normalized title.
  const groups = new Map<string, GroupedFinding>();

  for (const finding of findings) {
    const normalizedTitle = normalizeGroupTitle(finding.title);
    const groupKey = `${finding.severity}|${finding.source}|${normalizedTitle}`;

    const filepath = resolveFindingFilepath(finding);
    const line = Number.isFinite(finding.location.startLine)
      ? Math.trunc(finding.location.startLine)
      : 1;
    const location = `${filepath}:${line}`;

    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        key: groupKey,
        representative: finding,
        locations: [{ location, filepath, line }]
      });
      continue;
    }

    if (!existing.locations.some((l) => l.location === location)) {
      existing.locations.push({ location, filepath, line });
    }
  }

  const orderedGroups = Array.from(groups.values()).sort((a, b) => {
    const af = a.representative;
    const bf = b.representative;
    return (
      severityRank(bf.severity) - severityRank(af.severity) ||
      sourceRank(af.source) - sourceRank(bf.source) ||
      af.title.localeCompare(bf.title)
    );
  });

  return orderedGroups
    .map((group) =>
      group.locations.length > 1 ? formatGroupedFinding(group) : formatFinding(group.representative)
    )
    .join("\n\n");
}

export function formatScanResultJson(result: ScanResult): string {
  return JSON.stringify(
    {
      findings: result.findings,
      scannedFiles: result.scannedFiles,
      scannedChunks: result.scannedChunks,
      durationMs: result.durationMs
    },
    null,
    2
  );
}

export function formatScanResultCoreJson(result: ScanResult): string {
  const core: CoreScanResult = {
    findings: result.coreFindings ?? [],
    compositeFindings: result.coreCompositeFindings ?? [],
    scannedFiles: result.scannedFiles,
    scannedChunks: result.scannedChunks,
    durationMs: result.durationMs
  };
  return JSON.stringify(core, null, 2);
}
