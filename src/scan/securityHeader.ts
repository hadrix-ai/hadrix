import type { SecurityHeader } from "../types.js";

function renderList(lines: string[], label: string, items: string[]) {
  lines.push(`${label}:`);
  if (items.length === 0) {
    lines.push("  - none");
    return;
  }
  for (const item of items) {
    lines.push(`  - ${item}`);
  }
}

export function renderSecurityHeader(header: SecurityHeader): string {
  const lines: string[] = [];
  lines.push("ENTRY_POINT:");
  lines.push(`  type: ${header.entry_point?.type || "library"}`);
  lines.push(`  identifier: ${header.entry_point?.identifier || "unknown"}`);
  lines.push("");
  lines.push("EXECUTION_ROLE:");
  lines.push(`  ${header.execution_role || "unknown"}`);
  lines.push("");
  renderList(lines, "TRUST_BOUNDARIES", header.trust_boundaries ?? []);
  lines.push("");
  lines.push("AUTHENTICATION:");
  lines.push(`  enforced: ${header.authentication?.enforced || "unclear"}`);
  lines.push(`  mechanism: ${header.authentication?.mechanism || "none"}`);
  if (header.authentication?.location) {
    lines.push(`  location: ${header.authentication.location}`);
  }
  lines.push("");
  lines.push("AUTHORIZATION:");
  lines.push(`  enforced: ${header.authorization?.enforced || "unclear"}`);
  lines.push(`  model: ${header.authorization?.model || "none"}`);
  lines.push("");
  renderList(lines, "INPUT_SOURCES", header.input_sources ?? []);
  lines.push("");
  renderList(lines, "DATA_SENSITIVITY", header.data_sensitivity ?? []);
  lines.push("");
  renderList(lines, "SINKS", header.sinks ?? []);
  lines.push("");
  lines.push("REACHABILITY:");
  const entryPoints = header.reachability?.entry_points ?? [];
  if (entryPoints.length === 0) {
    lines.push("  entry_points: none");
  } else {
    lines.push("  entry_points:");
    for (const entryPoint of entryPoints) {
      lines.push(`    - ${entryPoint}`);
    }
  }
  if (typeof header.reachability?.min_depth === "number") {
    lines.push(`  min_depth: ${header.reachability.min_depth}`);
  }
  lines.push("");
  renderList(lines, "SECURITY_ASSUMPTIONS", header.security_assumptions ?? []);
  return lines.join("\n");
}

export function splitSecurityHeader(content: string): {
  header: string | null;
  body: string;
  headerLineCount: number;
} {
  if (!content) {
    return { header: null, body: content, headerLineCount: 0 };
  }
  const lines = content.split("\n");
  if (lines.length === 0 || lines[0].trim() !== "ENTRY_POINT:") {
    return { header: null, body: content, headerLineCount: 0 };
  }
  let sawAssumptions = false;
  let endIdx = -1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]?.trim() ?? "";
    if (line === "SECURITY_ASSUMPTIONS:") {
      sawAssumptions = true;
      continue;
    }
    if (sawAssumptions && line === "") {
      endIdx = i;
      break;
    }
  }
  if (endIdx === -1) {
    return { header: null, body: content, headerLineCount: 0 };
  }
  const header = lines.slice(0, endIdx).join("\n");
  const body = lines.slice(endIdx + 1).join("\n");
  return { header, body, headerLineCount: endIdx + 1 };
}
