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

function severityEmoji(severity: Finding["severity"]): string {
  switch (severity) {
    case "critical":
      return "🔥";
    case "high":
      return "🚨";
    case "medium":
      return "⚠️";
    case "low":
      return "🟢";
    case "info":
    default:
      return "ℹ️";
  }
}

const CATEGORY_THEME_LABELS: Record<string, string> = {
  injection: "Injection",
  access_control: "Access control",
  authentication: "Authentication",
  secrets: "Secrets",
  business_logic: "Logic issues",
  dependency_risks: "Dependency risks",
  configuration: "Configuration"
};

const THEME_EMOJI: Record<string, string> = {
  Injection: "💉",
  "Access control": "🔐",
  Authentication: "🗝️",
  Secrets: "🔎",
  "Logic issues": "🧠",
  "Dependency risks": "📦",
  Configuration: "🛡️",
  "Auth/AuthZ gaps": "🔐",
  "Command execution surface": "🧨",
  "Webhook trust issues": "🔗",
  "Token/session weaknesses": "🗝️",
  "Verbose errors / debug exposure": "🐞",
  "Missing security headers": "🛡️",
  "Excessive data exposure": "📤",
  "Missing rate limiting / lockout": "⏱️",
  "Mass assignment": "🧾"
};

function themeEmoji(theme: string): string {
  return THEME_EMOJI[theme] ?? "🔎";
}

function findingEmoji(finding: Finding): string {
  const theme = themeFromFinding(finding);
  return THEME_EMOJI[theme] ?? severityEmoji(finding.severity);
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

function formatFinding(finding: Finding, index?: number): string {
  const filepath = resolveFindingFilepath(finding);
  const location = `${filepath}:${finding.location.startLine}`;
  const lines: string[] = [];
  const sourceLabel = finding.source === "static" ? pc.cyan("STATIC") : pc.magenta("LLM");
  const indexLabel = index ? `#${index}` : "";
  lines.push(
    `${severityLabel(finding.severity)} ${findingEmoji(finding)} ${sourceLabel} ${indexLabel ? `${indexLabel} ` : ""}${finding.title}`
  );
  lines.push(`  location: ${location}`);
  if (finding.description) lines.push(`  ${finding.description}`);
  if (finding.evidence) lines.push(`  evidence: ${finding.evidence}`);
  if (finding.remediation) lines.push(`  remediation: ${finding.remediation}`);
  return lines.join("\n");
}

type FindingLocation = { location: string; filepath: string; line: number };

type GroupedFinding = {
  key: string;
  representative: Finding;
  locations: FindingLocation[];
  // Track title variants so aggressive LLM grouping is more transparent.
  titleVariants: Set<string>;
  // Used only for LLM fuzzy grouping.
  tokenKey?: string;
  tokens?: Set<string>;
};

function normalizeBasicTitle(title: string): string {
  return title
    .trim()
    .toLowerCase()
    // Strip trailing punctuation that often varies across otherwise-identical titles.
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

const LLM_GROUP_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "with",
  // domain filler
  "api",
  "http",
  "https",
  "endpoint",
  "endpoints",
  "request",
  "requests",
  "response",
  "responses",
  "handler",
  "handlers",
  "server",
  "route",
  "routes",
  "function",
  "functions"
]);

function normalizeToken(token: string): string {
  let t = token.trim().toLowerCase();
  if (!t) return "";
  // Strip punctuation.
  t = t.replace(/[^a-z0-9_-]/g, "");

  // Common synonym normalization.
  if (["absent", "missing", "unset"].includes(t)) return "missing";
  if (t === "headers" || t === "header") return "header";
  if (t === "auth" || t === "authentication") return "authentication";
  if (t === "authorisation") return "authorization";

  // Very light plural trimming.
  if (t.endsWith("ies") && t.length > 4) t = `${t.slice(0, -3)}y`;
  else if (t.endsWith("es") && t.length > 4) t = t.slice(0, -2);
  else if (t.endsWith("s") && t.length > 3) t = t.slice(0, -1);

  return t;
}

function canonicalizeLlmTitle(title: string): string {
  const t = normalizeBasicTitle(title);

  // Map frequent LLM phrasing variants into a smaller set of buckets.
  const rules: Array<{ re: RegExp; key: string }> = [
    { re: /\bmissing\b.*\bsecurity\b.*\bheader\b/, key: "missing_security_headers" },
    { re: /\bmissing\b.*\bheader\b/, key: "missing_headers" },
    { re: /\bverbose\b.*\berror\b|\bexpos\w+\b.*\berror\b/, key: "verbose_error_messages" },
    { re: /\bdebug\b.*\bendpoint\b|\bdebug\b.*\benabled\b/, key: "debug_endpoint_exposed" },
    { re: /\bno\b.*\brate\b[-\s]?limit|\bmissing\b.*\brate\b[-\s]?limit/, key: "missing_rate_limiting" },
    { re: /\bidor\b|\binsecure\b.*\bdirect\b.*\bobject\b/, key: "idor" },
    { re: /\bauthori[sz]ation\b.*\bmissing\b|\blacks?\b.*\bauthori[sz]ation\b|\bserver\b[-\s]?side\b.*\bauthori[sz]ation\b.*\bmissing\b/, key: "missing_server_side_authorization" },
    { re: /\bfrontend\b[-\s]?only\b.*\bauthori[sz]ation/, key: "frontend_only_authorization" },
    { re: /\bmass\b.*\bassignment\b/, key: "mass_assignment" },
    { re: /\btoken\b.*\bgenerat\w+\b.*\b(insecure|weak|predictable)|\binsecure\b.*\btoken\b.*\bgenerat\w+\b/, key: "insecure_token_generation" },
    { re: /\bweak\b.*\bjwt\b|\bjwt\b.*\bweak\b|\bjwt\b.*\bfallback\b|\bfallback\b.*\bjwt\b/, key: "weak_jwt_handling" },
    { re: /\bwebhook\b.*\b(auth|authn|authz)\b.*\black|\bwebhook\b.*\blacks?\b.*\bauth|\bwebhook\b.*\bunauthenticated\b/, key: "webhook_missing_authentication" },
    { re: /\bwebhook\b.*\b(signature|hmac)\b.*\b(verify|verification)\b.*\bmissing|\bwebhook\b.*\bdoes\b.*\bnot\b.*\bverify\b.*\bsignature\b/, key: "webhook_missing_signature_verification" },
    { re: /\bwebhook\b.*\breplay\b/, key: "webhook_missing_replay_protection" },
    { re: /\bcommand\b.*\binjection\b|\bshell\b.*\binjection\b/, key: "command_injection" },
    { re: /\bexpos\w+\b.*\bsensitive\b.*\b(data|token|user)\b|\bexcessive\b.*\bdata\b.*\bexposure\b/, key: "sensitive_data_exposure" }
  ];

  for (const rule of rules) {
    if (rule.re.test(t)) return rule.key;
  }

  // Fallback to token signature.
  return `title:${t}`;
}

function tokenizeForLlmGrouping(title: string): Set<string> {
  // Tokenize the canonicalized title first so variants like
  // "Missing header in response" vs "Missing header in API response" merge.
  const canonical = canonicalizeLlmTitle(title);
  const base = canonical.startsWith("title:") ? canonical.slice("title:".length) : canonical;

  const basic = base
    .replace(/[^a-z0-9\s_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const rawTokens = basic.split(" ").filter(Boolean);
  const tokens = new Set<string>();
  for (const raw of rawTokens) {
    const token = normalizeToken(raw);
    if (!token) continue;
    if (LLM_GROUP_STOPWORDS.has(token)) continue;
    if (token.length <= 2) continue;
    tokens.add(token);
  }
  return tokens;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 1;
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
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

function formatGroupedFinding(group: GroupedFinding, index?: number): string {
  const finding = group.representative;
  const lines: string[] = [];
  const sourceLabel = finding.source === "static" ? pc.cyan("STATIC") : pc.magenta("LLM");

  const indexLabel = index ? `#${index}` : "";
  lines.push(
    `${severityLabel(finding.severity)} ${findingEmoji(finding)} ${sourceLabel} ${indexLabel ? `${indexLabel} ` : ""}${finding.title}`
  );

  const variants = Array.from(group.titleVariants)
    .map((t) => t.trim())
    .filter(Boolean);
  if (variants.length > 1) {
    const shown = variants
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 3);
    lines.push(`  matched titles: ${shown.map((t) => `"${t}"`).join(", ")}${variants.length > 3 ? "…" : ""}`);
  }

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

function toLocation(finding: Finding): FindingLocation {
  const filepath = resolveFindingFilepath(finding);
  const line = Number.isFinite(finding.location.startLine)
    ? Math.trunc(finding.location.startLine)
    : 1;
  return {
    filepath,
    line,
    location: `${filepath}:${line}`
  };
}

function groupStaticFindings(findings: Finding[]): GroupedFinding[] {
  // Keep static grouping conservative: exact normalized title only.
  const groups = new Map<string, GroupedFinding>();

  for (const finding of findings) {
    const normalizedTitle = normalizeBasicTitle(finding.title);
    const groupKey = `${finding.severity}|${finding.source}|${normalizedTitle}`;

    const loc = toLocation(finding);
    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, {
        key: groupKey,
        representative: finding,
        locations: [loc],
        titleVariants: new Set([finding.title])
      });
      continue;
    }

    if (!existing.locations.some((l) => l.location === loc.location)) {
      existing.locations.push(loc);
    }
    existing.titleVariants.add(finding.title);
  }

  return Array.from(groups.values());
}

function groupLlmFindingsAggressively(findings: Finding[]): GroupedFinding[] {
  // Aggressive LLM grouping: canonicalize + cluster by token similarity.
  // Goal: keep the output readable for humans.
  const groups: GroupedFinding[] = [];

  for (const finding of findings) {
    const canonical = canonicalizeLlmTitle(finding.title);
    const tokens = tokenizeForLlmGrouping(finding.title);

    // Primary key uses canonical bucket + severity.
    const baseKey = `${finding.severity}|${finding.source}|${canonical}`;

    const loc = toLocation(finding);

    // 1) Exact canonical bucket match first.
    const exact = groups.find((g) => g.key === baseKey);
    if (exact) {
      if (!exact.locations.some((l) => l.location === loc.location)) {
        exact.locations.push(loc);
      }
      exact.titleVariants.add(finding.title);
      continue;
    }

    // 2) Otherwise, similarity-based merge within same severity.
    let best: { group: GroupedFinding; score: number } | null = null;
    for (const group of groups) {
      if (group.representative.severity !== finding.severity) continue;
      if (group.representative.source !== finding.source) continue;
      if (!group.tokens) continue;

      const score = jaccard(tokens, group.tokens);
      if (!best || score > best.score) {
        best = { group, score };
      }
    }

    const minTokens = Math.min(tokens.size, best?.group.tokens?.size ?? tokens.size);
    // Slightly more aggressive than before.
    const threshold = minTokens <= 3 ? 0.55 : 0.68;

    if (best && best.score >= threshold) {
      if (!best.group.locations.some((l) => l.location === loc.location)) {
        best.group.locations.push(loc);
      }
      best.group.titleVariants.add(finding.title);
      continue;
    }

    groups.push({
      key: baseKey,
      representative: finding,
      locations: [loc],
      titleVariants: new Set([finding.title]),
      tokenKey: Array.from(tokens).sort().join("|"),
      tokens
    });
  }

  return groups;
}

function severityHeaderLabel(severity: Finding["severity"]): string {
  // Non-colored labels for summary headers (works well when piping to files).
  switch (severity) {
    case "critical":
      return "CRITICAL";
    case "high":
      return "HIGH";
    case "medium":
      return "MEDIUM";
    case "low":
      return "LOW";
    case "info":
    default:
      return "INFO";
  }
}

function normalizeCategory(raw?: string | null): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, "_").replace(/-/g, "_");
  return normalized || null;
}

function themeFromCategory(category?: string | null): string | null {
  const normalized = normalizeCategory(category);
  if (!normalized) return null;
  return CATEGORY_THEME_LABELS[normalized] ?? null;
}

function themeFromCanonicalKey(canonical: string): string {
  if (canonical.startsWith("title:")) return "Other";
  if (canonical.includes("authorization") || canonical.includes("idor") || canonical.includes("auth")) {
    return "Auth/AuthZ gaps";
  }
  if (canonical.includes("command_injection")) return "Command execution surface";
  if (canonical.startsWith("webhook_")) return "Webhook trust issues";
  if (canonical.includes("token") || canonical.includes("jwt")) return "Token/session weaknesses";
  if (canonical.includes("error") || canonical.includes("debug")) return "Verbose errors / debug exposure";
  if (canonical.includes("missing_headers")) return "Missing security headers";
  if (canonical.includes("data_exposure")) return "Excessive data exposure";
  if (canonical.includes("rate")) return "Missing rate limiting / lockout";
  if (canonical.includes("mass_assignment")) return "Mass assignment";
  return "Other";
}

function themeFromFinding(finding: Finding): string {
  const byCategory = themeFromCategory(finding.category);
  if (byCategory) return byCategory;
  const canonical = canonicalizeLlmTitle(finding.title);
  return themeFromCanonicalKey(canonical);
}

function buildSummary(groups: GroupedFinding[]): string {
  const total = groups.length;
  const bySeverity: Record<string, number> = {
    CRITICAL: 0,
    HIGH: 0,
    MEDIUM: 0,
    LOW: 0,
    INFO: 0
  };
  const bySource: Record<Finding["source"], number> = { static: 0, llm: 0 };

  const themeCounts = new Map<string, { count: number; worst: Finding["severity"] }>();

  for (const group of groups) {
    const sevLabel = severityHeaderLabel(group.representative.severity);
    bySeverity[sevLabel] = (bySeverity[sevLabel] ?? 0) + 1;
    bySource[group.representative.source] += 1;

    if (group.representative.source !== "static") {
      const theme = themeFromFinding(group.representative);
      const existing = themeCounts.get(theme);
      if (!existing) {
        themeCounts.set(theme, { count: 1, worst: group.representative.severity });
      } else {
        existing.count += 1;
        if (severityRank(group.representative.severity) > severityRank(existing.worst)) {
          existing.worst = group.representative.severity;
        }
      }
    }
  }

  const orderedThemes = Array.from(themeCounts.entries())
    .sort((a, b) => {
      // Sort by worst severity first, then count.
      const aScore = severityRank(a[1].worst) * 1000 + a[1].count;
      const bScore = severityRank(b[1].worst) * 1000 + b[1].count;
      return bScore - aScore || a[0].localeCompare(b[0]);
    })
    .slice(0, 5);

  const themeLines = orderedThemes.length
    ? orderedThemes
        .map(
          ([theme, meta], i) =>
            `  ${i + 1}) ${themeEmoji(theme)} ${theme} (${severityHeaderLabel(meta.worst)}, ${meta.count})`
        )
        .join("\n")
    : "  (none)";

  const summaryLines = [
    "HADRIX SUMMARY",
    "----------------",
    `- Findings: ${total} total (🔥 CRITICAL ${bySeverity.CRITICAL}, 🚨 HIGH ${bySeverity.HIGH}, ⚠️ MEDIUM ${bySeverity.MEDIUM}, 🟢 LOW ${bySeverity.LOW}, ℹ️ INFO ${bySeverity.INFO})`,
    `- Sources: ${bySource.static} static, ${bySource.llm} llm`,
    "- Highest-risk themes:",
    themeLines,
    "- PRIORITY FIX ORDER (fastest risk reduction):",
    "  P0: Fix missing server-side auth/authz on sensitive endpoints (admin/delete/list, webhooks, repo scanning)",
    "  P1: Remove/lock down command execution surfaces (scan-repo/runShell) and validate all shell inputs",
    "  P1: Stop returning/logging sensitive payloads and verbose internal errors to clients",
    "  P2: Harden webhook trust (signature verification + replay protection)",
    "  P2: Fix token/JWT handling (no weak defaults, proper verification)",
    "  P3: Add rate limiting/lockout and sane pagination for bulk endpoints",
    "  P3: Add security headers + tighten CORS",
    "",
    "ALL FINDINGS",
    `The following is a description of all ${total} findings. Paste into LLM to begin fixing security issues.`,
    "Note: Some issues may not be fixable by your agent alone (for example, adding new RLS policies to Supabase tables)."
  ];

  return summaryLines.join("\n");
}

export function formatFindingsText(findings: Finding[]): string {
  if (!findings.length) {
    return "No findings.";
  }

  // Group only for text output; JSON outputs remain unchanged.
  // - Static: conservative grouping
  // - LLM: aggressive fuzzy grouping
  const staticFindings = findings.filter((f) => f.source === "static");
  const llmFindings = findings.filter((f) => f.source !== "static");

  const groups = [...groupStaticFindings(staticFindings), ...groupLlmFindingsAggressively(llmFindings)];

  const orderedGroups = groups.sort((a, b) => {
    const af = a.representative;
    const bf = b.representative;
    return (
      severityRank(bf.severity) - severityRank(af.severity) ||
      sourceRank(af.source) - sourceRank(bf.source) ||
      af.title.localeCompare(bf.title)
    );
  });

  const body = orderedGroups
    .map((group, index) =>
      group.locations.length > 1
        ? formatGroupedFinding(group, index + 1)
        : formatFinding(group.representative, index + 1)
    )
    .join("\n\n");

  return `${buildSummary(orderedGroups)}\n${body}\n\n--- END FULL FINDINGS ---`;
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
