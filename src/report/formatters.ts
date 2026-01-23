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

function formatFinding(finding: Finding): string {
  const repoPath = finding.location.repoPath;
  const filepath =
    repoPath &&
    finding.location.filepath &&
    !finding.location.filepath.startsWith(`${repoPath}/`) &&
    finding.location.filepath !== repoPath
      ? `${repoPath}/${finding.location.filepath}`.replace(/\/+/g, "/")
      : finding.location.filepath;
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

export function formatFindingsText(findings: Finding[]): string {
  if (!findings.length) {
    return "No findings.";
  }
  return findings.map((finding) => formatFinding(finding)).join("\n\n");
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
