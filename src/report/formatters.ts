import pc from "picocolors";
import type { Finding, ScanResult } from "../types.js";

function severityLabel(severity: Finding["severity"]): string {
  switch (severity) {
    case "critical":
      return pc.bgRed(pc.white(" CRITICAL "));
    case "high":
      return pc.red("HIGH");
    case "medium":
      return pc.yellow("MEDIUM");
    case "low":
    default:
      return pc.green("LOW");
  }
}

function formatFinding(finding: Finding): string {
  const location = `${finding.location.filepath}:${finding.location.startLine}`;
  const lines: string[] = [];
  lines.push(`${severityLabel(finding.severity)} ${finding.title}`);
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
  return JSON.stringify(result, null, 2);
}
