export type FindingIdentityInput = {
  summary?: string;
  type?: string | null;
  category?: string | null;
  source?: string | null;
  location?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
};

const IDENTITY_KIND_ALIASES: Record<string, string> = {
  missing_rate_limiting: "rate_limiting",
  missing_rate_limit: "rate_limiting",
  frontend_login_rate_limit: "rate_limiting",
  rate_limiting: "rate_limiting",
  missing_audit_logging: "audit_logging",
  missing_audit_log: "audit_logging",
  audit_logging: "audit_logging",
  missing_lockout: "lockout",
  login_lockout_missing: "lockout",
  missing_timeout: "timeout",
  missing_timeouts: "timeout",
  timeout: "timeout",
  object_injection: "prototype_pollution",
  prototype_pollution: "prototype_pollution",
  idor: "idor",
  sql_injection: "sql_injection",
  command_injection: "command_injection",
  unbounded_query: "unbounded_query",
  permissive_cors: "permissive_cors"
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function normalizeRepoPath(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\\/g, "/")
    .trim()
    .replace(/^[./]+/, "")
    .replace(/\/+$/, "");
}

function normalizeFilepath(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\\/g, "/").trim().replace(/^\.?\/*/, "");
}

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\|/g, "/");
}

function normalizeTypeToken(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeIdentityTypeValue(value: string): string {
  const normalized = normalizeTypeToken(value);
  if (!normalized) return "";
  return IDENTITY_KIND_ALIASES[normalized] ?? normalized;
}

export function extractFindingIdentityType(finding: FindingIdentityInput): string {
  const details = toRecord(finding.details);
  const candidates = [
    finding.type,
    details.findingType,
    details.finding_type,
    details.type,
    details.ruleId,
    details.rule_id,
    details.ruleID,
    finding.category,
    details.category,
    details.findingCategory,
    details.finding_category
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (!trimmed) continue;
    const normalized = normalizeIdentityTypeValue(trimmed);
    if (normalized) return normalized;
  }
  return "";
}

export function extractAnchorNodeId(finding: FindingIdentityInput): string {
  const details = toRecord(finding.details);
  const raw =
    details.anchorNodeId ?? details.anchor_node_id ?? details.anchorId ?? details.anchor_id;
  return typeof raw === "string" ? raw.trim() : "";
}

export function extractOverlapGroupId(finding: FindingIdentityInput): string {
  const details = toRecord(finding.details);
  const raw =
    details.overlapGroupId ??
    details.overlap_group_id ??
    details.overlapId ??
    details.overlap_id;
  return typeof raw === "string" ? raw.trim() : "";
}

function extractPackageIdentity(finding: FindingIdentityInput): string {
  const details = toRecord(finding.details);
  const packageName = typeof details.packageName === "string" ? details.packageName.trim() : "";
  const packageVersion = typeof details.packageVersion === "string" ? details.packageVersion.trim() : "";
  const ecosystem = typeof details.ecosystem === "string" ? details.ecosystem.trim() : "";
  const parts = [ecosystem, packageName, packageVersion].filter(Boolean);
  if (parts.length === 0) return "";
  return `pkg:${parts.join("@")}`;
}

function parseLineNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function parseChunkIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function extractLocationParts(
  finding: FindingIdentityInput,
  fallbackRepoPath?: string | null
): {
  repoPath: string;
  fileKey: string;
  startLine: number | null;
  endLine: number | null;
  chunkIndex: number | null;
} {
  const details = toRecord(finding.details);
  const location = toRecord(finding.location);
  const repoPath = normalizeRepoPath(
    location.repoPath ?? location.repo_path ?? details.repoPath ?? details.repo_path ?? fallbackRepoPath ?? ""
  );
  const filepathRaw =
    (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  const filepath = normalizeFilepath(filepathRaw);
  const fileKey =
    repoPath && filepath.startsWith(`${repoPath}/`)
      ? filepath.slice(repoPath.length + 1)
      : filepath;

  const startLine = parseLineNumber(
    location.startLine ?? location.start_line ?? location.line ?? location.start
  );
  const endLine = parseLineNumber(
    location.endLine ?? location.end_line ?? location.lineEnd ?? location.end
  );
  const normalizedStart = startLine ?? endLine;
  const normalizedEnd = endLine ?? normalizedStart;

  const chunkIndex = parseChunkIndex(
    (location as any).chunkIndex ?? (location as any).chunk_index
  );

  return {
    repoPath,
    fileKey,
    startLine: normalizedStart ?? null,
    endLine: normalizedEnd ?? null,
    chunkIndex
  };
}

export function buildFindingIdentityKey(
  finding: FindingIdentityInput,
  options?: { fallbackRepoPath?: string | null }
): string {
  const location = extractLocationParts(finding, options?.fallbackRepoPath ?? null);
  if (!location.fileKey) return "";

  const anchorNodeId = extractAnchorNodeId(finding);
  const overlapGroupId = extractOverlapGroupId(finding);
  let anchorKey = "";
  if (anchorNodeId) {
    anchorKey = `anchor:${anchorNodeId}`;
  } else if (overlapGroupId) {
    anchorKey = `overlap:${overlapGroupId}`;
  } else if (location.startLine !== null || location.endLine !== null) {
    const start = location.startLine ?? location.endLine ?? 0;
    let end = location.endLine ?? start;
    if (end < start) end = start;
    anchorKey = `lines:${start}-${end}`;
  } else if (location.chunkIndex !== null) {
    anchorKey = `chunk:${location.chunkIndex}`;
  } else {
    anchorKey = "lines:0-0";
  }

  let typeKey = extractFindingIdentityType(finding);
  if (!typeKey) {
    const summary = typeof finding.summary === "string" ? finding.summary.trim() : "";
    if (summary) {
      typeKey = `summary:${normalizeKeyPart(summary)}`;
    }
  }
  if (!typeKey) return "";

  const parts = [
    normalizeKeyPart(location.repoPath),
    normalizeKeyPart(location.fileKey),
    normalizeKeyPart(anchorKey),
    normalizeKeyPart(typeKey)
  ];
  const packageKey = extractPackageIdentity(finding);
  if (packageKey) {
    parts.push(normalizeKeyPart(packageKey));
  }
  return parts.join("|");
}
