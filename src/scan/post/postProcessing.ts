import type { ExistingScanFinding, RepositoryScanFinding } from "../../types.js";
import type { DedupeDebug } from "../debugLog.js";
import {
  buildFindingIdentityKey,
  extractFindingIdentityType,
  normalizeIdentityTypeValue
} from "../dedupeKey.js";

export type FindingLike = {
  summary: string;
  severity?: string | null;
  source?: string | null;
  location?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
};

function logDebug(debug: DedupeDebug | undefined, event: Record<string, unknown>): void {
  if (!debug) return;
  debug.log({ stage: debug.stage, ...event });
}

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

function canonicalizeFilePath(repoPath: string, filepath: string): string {
  const normalizedRepoPath = normalizeRepoPath(repoPath);
  const normalizedFilepath = normalizeFilepath(filepath);
  if (!normalizedFilepath) return "";
  if (!normalizedRepoPath) return normalizedFilepath.toLowerCase();
  if (normalizedFilepath.startsWith(`${normalizedRepoPath}/`)) {
    return normalizedFilepath.toLowerCase();
  }
  return `${normalizedRepoPath}/${normalizedFilepath}`.toLowerCase();
}

function parsePositiveInt(value: unknown): number | null {
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

function extractFindingLocation(
  location: Record<string, unknown> | null | undefined
): {
  canonicalPath: string;
  startLine: number | null;
  endLine: number | null;
  chunkIndex: number | null;
} {
  if (!location || typeof location !== "object" || Array.isArray(location)) {
    return { canonicalPath: "", startLine: null, endLine: null, chunkIndex: null };
  }

  const repoPath = (location.repoPath ?? location.repo_path) as unknown;
  const filepath = (location.filepath ??
    location.filePath ??
    location.path ??
    location.file) as unknown;
  const canonicalPath = canonicalizeFilePath(
    typeof repoPath === "string" ? repoPath : "",
    typeof filepath === "string" ? filepath : ""
  );

  const startLine = parsePositiveInt(
    location.startLine ?? location.start_line ?? location.line ?? location.start
  );
  const endLine = parsePositiveInt(
    location.endLine ?? location.end_line ?? location.lineEnd ?? location.end
  );
  const chunkIndex = parseChunkIndex(
    (location as any).chunkIndex ?? (location as any).chunk_index
  );

  return {
    canonicalPath,
    startLine,
    endLine: endLine ?? startLine,
    chunkIndex
  };
}

function normalizeRepoFullName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

function isRepositorySummaryFinding(finding: FindingLike): boolean {
  const location = toRecord(finding.location);
  const filepathRaw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  if (typeof filepathRaw !== "string") {
    return true;
  }
  const normalized = normalizeFilepath(filepathRaw);
  if (!normalized) {
    return true;
  }
  return normalized.toLowerCase() === REPOSITORY_SUMMARY_PATH;
}

function extractRepoFullNameFromFinding(finding: {
  location?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
}): string {
  const location = toRecord(finding.location);
  const details = toRecord(finding.details);
  const direct = (finding as any).repositoryFullName ?? (finding as any).repoFullName;
  return (
    normalizeRepoFullName(direct) ||
    normalizeRepoFullName(location.repoFullName) ||
    normalizeRepoFullName(location.repositoryFullName) ||
    normalizeRepoFullName(details.repoFullName) ||
    normalizeRepoFullName(details.repositoryFullName)
  );
}

function extensionOfPath(pathname: string): string {
  const idx = pathname.lastIndexOf(".");
  if (idx === -1) return "";
  return pathname.slice(idx).toLowerCase();
}

function rangesOverlap(
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
  slack: number = 2
): boolean {
  const aS = Math.max(1, Math.min(aStart, aEnd) - slack);
  const aE = Math.max(aStart, aEnd) + slack;
  const bS = Math.max(1, Math.min(bStart, bEnd) - slack);
  const bE = Math.max(bStart, bEnd) + slack;
  return aS <= bE && bS <= aE;
}

const NON_CODE_FILE_EXTENSIONS = new Set([".json", ".lock", ".md", ".yaml", ".yml"]);
const FRONTEND_PATH_SEGMENTS = ["frontend", "components", "app", "pages"];
const APP_ROUTER_PATH_PATTERN = /(^|\/)(src\/)?app(\/|$)/i;
const APP_ROUTER_API_PATH_PATTERN = /(^|\/)(src\/)?app\/api(\/|$)/i;
const APP_ROUTER_SERVER_COMPONENT_FILE_PATTERN =
  /(?:^|\/)(page|layout|template|error|loading|not-found)\.[tj]sx?$/i;
const SERVER_PATH_SEGMENTS = ["api", "functions", "server", "backend"];
const SERVER_ACTION_PATH_PATTERNS = [
  /^app\/actions(?:\/|$|\.)/i,
  /\/app\/actions(?:\/|$|\.)/i,
  /^app\/.*\/actions(?:\/|$|\.)/i,
  /\/app\/.*\/actions(?:\/|$|\.)/i
];
const FRONTEND_ONLY_EXTENSIONS = new Set([".tsx", ".jsx"]);
const DESTRUCTIVE_PATH_PATTERNS = [
  /delete/i,
  /remove/i,
  /destroy/i,
  /revoke/i,
  /disable/i,
  /suspend/i
];
const DESTRUCTIVE_TEXT_PATTERNS = [
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdestroy\b/i,
  /\brevoke\b/i,
  /\bdisable\b/i,
  /\bsuspend\b/i
];
const SUMMARY_STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "of",
  "for",
  "to",
  "on",
  "in",
  "with",
  "without",
  "and",
  "or",
  "no",
  "not",
  "missing",
  "lack",
  "lacking",
  "is",
  "are",
  "be",
  "as",
  "by",
  "via",
  "from",
  "into",
  "this",
  "that",
  "these",
  "those",
  "should"
]);
const SUMMARY_SIMILARITY_THRESHOLD = 0.88;
const REPOSITORY_SUMMARY_PATH = "(repository)";
const DEDUPE_KIND_ALIASES: Record<string, string> = {
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
const DEDUPE_CATEGORY_RULES: Array<{ key: string; patterns: RegExp[] }> = [
  { key: "prototype_pollution", patterns: [/prototype poll/i, /object injection/i] },
  { key: "rate_limiting", patterns: [/rate limit/i, /ratelimit/i, /throttl/i] },
  { key: "audit_logging", patterns: [/audit log/i, /audit logging/i] },
  { key: "lockout", patterns: [/lockout/i, /account lock/i, /brute[- ]?force/i, /login attempts/i] },
  { key: "timeout", patterns: [/timeout/i, /time out/i] },
  { key: "idor", patterns: [/idor/i, /insecure direct object/i] },
  { key: "sql_injection", patterns: [/sql injection/i] },
  { key: "command_injection", patterns: [/command injection/i, /shell injection/i] },
  { key: "permissive_cors", patterns: [/cors/i, /cross[- ]origin/i] },
  { key: "unbounded_query", patterns: [/unbounded/i, /missing limit/i, /no pagination/i, /missing pagination/i] }
];

function hasPathSegment(filepath: string, segment: string): boolean {
  return new RegExp(`(^|/)${segment}(/|$)`).test(filepath);
}

function hasServerActionEntryPoint(details: Record<string, unknown>): boolean {
  const entryPoint = extractEntryPointIdentity({ summary: "", details });
  if (!entryPoint) return false;
  const normalized = entryPoint.toLowerCase();
  return normalized.includes("server.action") || normalized.includes("server action") ||
    normalized.includes("use server");
}

function isAppRouterServerComponentPath(filepath: string): boolean {
  const normalized = filepath.startsWith("/") ? filepath : `/${filepath}`;
  if (!APP_ROUTER_PATH_PATTERN.test(normalized)) {
    return false;
  }
  if (APP_ROUTER_API_PATH_PATTERN.test(normalized)) {
    return false;
  }
  if (SERVER_ACTION_PATH_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return false;
  }
  return APP_ROUTER_SERVER_COMPONENT_FILE_PATTERN.test(normalized);
}

function isFrontendOnlyPath(filepath: string, details?: Record<string, unknown>): boolean {
  const lower = filepath.toLowerCase();
  if (details && hasServerActionEntryPoint(details)) {
    return false;
  }
  if (SERVER_ACTION_PATH_PATTERNS.some((pattern) => pattern.test(lower))) {
    return false;
  }
  if (isAppRouterServerComponentPath(lower)) {
    return false;
  }
  const hasFrontendSegment = FRONTEND_PATH_SEGMENTS.some((segment) => hasPathSegment(lower, segment));
  const hasFrontendExtension = FRONTEND_ONLY_EXTENSIONS.has(extensionOfPath(lower));
  const hasServerSegment = SERVER_PATH_SEGMENTS.some((segment) => hasPathSegment(lower, segment));
  return (hasFrontendSegment || hasFrontendExtension) && !hasServerSegment;
}

function normalizeFindingKind(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeEntryPointIdentity(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");
}

function normalizeRuleIdAlias(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return normalizeIdentityTypeValue(trimmed);
}

function extractFindingRuleId(finding: FindingLike): string {
  const details = toRecord(finding.details);
  const ruleId =
    details.ruleId ??
    details.rule_id ??
    details.ruleID ??
    details.findingType ??
    details.finding_type;
  return typeof ruleId === "string" ? ruleId.trim() : "";
}

function extractEntryPointIdentity(finding: FindingLike): string {
  const details = toRecord(finding.details);
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
}

function extractPrimarySymbolIdentity(finding: FindingLike): string {
  const details = toRecord(finding.details);
  const raw = details.primarySymbol ?? details.primary_symbol;
  return typeof raw === "string" ? raw.trim() : "";
}

function extractFindingKind(finding: FindingLike): string {
  const details = toRecord(finding.details);
  const raw = details.findingType ?? details.finding_type ?? details.type;
  return typeof raw === "string" ? raw.trim() : "";
}

function extractCandidateTypeForMerge(finding: FindingLike): string {
  const details = toRecord(finding.details);
  const raw = details.candidateType ?? details.candidate_type;
  if (typeof raw !== "string") return "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return normalizeIdentityTypeValue(trimmed);
}

function extractFindingCategory(finding: FindingLike): string {
  const details = toRecord(finding.details);
  const raw = details.category ?? details.findingCategory ?? details.finding_category;
  return typeof raw === "string" ? raw.trim().toLowerCase() : "";
}

function extractDetectorId(finding: FindingLike, sourceFallback?: string): string {
  const details = toRecord(finding.details);
  const tool =
    typeof details.tool === "string"
      ? details.tool.trim()
      : typeof finding.source === "string"
        ? finding.source.trim()
        : "";
  return tool || sourceFallback || "";
}

function extractAnchorNodeId(finding: FindingLike): string {
  const details = toRecord(finding.details);
  const raw = details.anchorNodeId ?? details.anchor_node_id ?? details.anchorId ?? details.anchor_id;
  return typeof raw === "string" ? raw.trim() : "";
}

function extractOverlapGroupId(finding: FindingLike): string {
  const details = toRecord(finding.details);
  const raw = details.overlapGroupId ?? details.overlap_group_id ?? details.overlapId ?? details.overlap_id;
  return typeof raw === "string" ? raw.trim() : "";
}

function extractDedupeKey(finding: FindingLike): string {
  const details = toRecord(finding.details);
  const raw =
    details.identityKey ??
    details.identity_key ??
    details.dedupeKey ??
    details.dedupe_key ??
    details.semanticKey ??
    details.semantic_key;
  return typeof raw === "string" ? raw.trim() : "";
}

function buildDedupeKey(finding: FindingLike): string {
  return buildFindingIdentityKey(finding);
}

function buildDebugFinding(finding: FindingLike): Record<string, unknown> {
  const details = toRecord(finding.details);
  const location = toRecord(finding.location);
  const locationParts = extractFindingLocation(location);
  const rawPath = normalizeFilepath(
    (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown
  );
  const filepath = locationParts.canonicalPath || rawPath || "";
  const repoFullName = extractRepoFullNameFromFinding({ location, details });
  const repoPathRaw = location.repoPath ?? location.repo_path;
  const repoPath = typeof repoPathRaw === "string" ? normalizeRepoPath(repoPathRaw) : "";
  const identityType = extractFindingIdentityType({
    summary: finding.summary,
    type: (finding as any).type ?? null,
    category: extractFindingCategory(finding) || null,
    source: finding.source ?? null,
    location: finding.location ?? null,
    details: finding.details ?? null
  });
  const dedupeKey = extractDedupeKey(finding) || buildDedupeKey(finding);
  const candidateTypeRaw = details.candidateType ?? details.candidate_type ?? null;

  return {
    summary: finding.summary,
    severity: finding.severity ?? null,
    source: extractDetectorId(finding) || null,
    type: identityType || null,
    category: extractFindingCategory(finding) || null,
    ruleId: extractFindingRuleId(finding) || null,
    candidateType: typeof candidateTypeRaw === "string" ? candidateTypeRaw.trim() : null,
    dedupeKey: dedupeKey || null,
    entryPoint: extractEntryPointIdentity(finding) || null,
    anchorNodeId: extractAnchorNodeId(finding) || null,
    overlapGroupId: extractOverlapGroupId(finding) || null,
    repoFullName: repoFullName || null,
    location: {
      filepath: filepath || null,
      startLine: locationParts.startLine,
      endLine: locationParts.endLine,
      chunkIndex: locationParts.chunkIndex,
      repoPath: repoPath || null
    }
  };
}

function isSecretsFinding(finding: FindingLike): boolean {
  const category = extractFindingCategory(finding);
  if (category === "secrets") return true;
  const detector = extractDetectorId(finding);
  return detector.includes("gitleaks");
}

function isDependencyFinding(finding: FindingLike): boolean {
  const category = extractFindingCategory(finding);
  if (category === "dependency_risks") return true;
  const detector = extractDetectorId(finding);
  if (detector.includes("osv")) return true;
  const ruleId = extractFindingRuleId(finding);
  return /^CVE-|^GHSA-|^osv:/i.test(ruleId);
}

function buildFindingText(finding: FindingLike): string {
  const ruleId = extractFindingRuleId(finding);
  const kind = extractFindingKind(finding);
  return `${finding.summary ?? ""} ${ruleId} ${kind}`.toLowerCase();
}

function extractDedupCategory(finding: FindingLike): string {
  const kind = normalizeFindingKind(extractFindingKind(finding) || extractFindingRuleId(finding));
  if (kind && DEDUPE_KIND_ALIASES[kind]) return DEDUPE_KIND_ALIASES[kind];
  const text = buildFindingText(finding);
  for (const rule of DEDUPE_CATEGORY_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return rule.key;
    }
  }
  return "";
}

function isBackendOnlyControlFinding(finding: FindingLike): boolean {
  const category = extractDedupCategory(finding);
  return category === "rate_limiting" || category === "audit_logging" || category === "lockout";
}

function isRuntimeControlFinding(finding: FindingLike): boolean {
  const category = extractDedupCategory(finding);
  return (
    category === "rate_limiting" ||
    category === "audit_logging" ||
    category === "lockout" ||
    category === "timeout"
  );
}

function isMissingControlFinding(finding: FindingLike): boolean {
  return isBackendOnlyControlFinding(finding);
}

function isAuditLoggingFinding(finding: FindingLike): boolean {
  return extractDedupCategory(finding) === "audit_logging";
}

function tokenSet(value: string): Set<string> {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!normalized) return new Set();
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !SUMMARY_STOP_WORDS.has(token));
  return new Set(tokens);
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function summarySimilarity(a: FindingLike, b: FindingLike): number {
  return jaccardSimilarity(tokenSet(buildFindingText(a)), tokenSet(buildFindingText(b)));
}

function isLikelyDestructiveFinding(finding: FindingLike, filepath: string): boolean {
  if (DESTRUCTIVE_PATH_PATTERNS.some((pattern) => pattern.test(filepath))) {
    return true;
  }
  const text = buildFindingText(finding);
  return DESTRUCTIVE_TEXT_PATTERNS.some((pattern) => pattern.test(text));
}

type SemanticSimilarityOptions = {
  requireOverlap?: boolean;
  requireEntryPoint?: boolean;
};

function areFindingsSemanticallySimilar(
  a: FindingLike,
  b: FindingLike,
  options?: SemanticSimilarityOptions
): boolean {
  const requireOverlap = options?.requireOverlap ?? false;
  const requireEntryPoint = options?.requireEntryPoint ?? false;
  if (requireOverlap && !locationsOverlapMatch(a, b)) {
    return false;
  }
  const entryPointA = normalizeEntryPointIdentity(extractEntryPointIdentity(a));
  const entryPointB = normalizeEntryPointIdentity(extractEntryPointIdentity(b));
  if (requireEntryPoint) {
    if (!entryPointA || !entryPointB) {
      return false;
    }
    if (entryPointA !== entryPointB) {
      return false;
    }
  } else if (entryPointA && entryPointB && entryPointA !== entryPointB) {
    return false;
  }
  const candidateTypeA = extractCandidateTypeForMerge(a);
  const candidateTypeB = extractCandidateTypeForMerge(b);
  if (candidateTypeA && candidateTypeB && candidateTypeA !== candidateTypeB) {
    return false;
  }
  const typeA = extractFindingIdentityType(a);
  const typeB = extractFindingIdentityType(b);
  if (typeA && typeB && typeA !== typeB) {
    return false;
  }
  const ruleIdA = normalizeRuleIdAlias(extractFindingRuleId(a));
  const ruleIdB = normalizeRuleIdAlias(extractFindingRuleId(b));
  if (ruleIdA && ruleIdB && ruleIdA === ruleIdB) return true;
  const identityMatch = Boolean(
    (candidateTypeA && candidateTypeB && candidateTypeA === candidateTypeB) ||
    (typeA && typeB && typeA === typeB) ||
    (entryPointA && entryPointB && entryPointA === entryPointB)
  );
  const categoryA = extractDedupCategory(a);
  const categoryB = extractDedupCategory(b);
  if (categoryA && categoryB && categoryA === categoryB) {
    return identityMatch;
  }
  const kindA = normalizeFindingKind(extractFindingKind(a));
  const kindB = normalizeFindingKind(extractFindingKind(b));
  if (kindA && kindB && kindA === kindB) {
    return identityMatch;
  }
  if (!identityMatch) {
    return false;
  }
  return summarySimilarity(a, b) >= SUMMARY_SIMILARITY_THRESHOLD;
}

function buildMergeDiagnostics(a: FindingLike, b: FindingLike): Record<string, unknown> {
  const dedupeKeyA = extractDedupeKey(a) || buildDedupeKey(a);
  const dedupeKeyB = extractDedupeKey(b) || buildDedupeKey(b);
  const anchorNodeIdA = extractAnchorNodeId(a);
  const anchorNodeIdB = extractAnchorNodeId(b);
  const overlapGroupIdA = extractOverlapGroupId(a);
  const overlapGroupIdB = extractOverlapGroupId(b);
  const repoA = extractRepoFullNameFromFinding(a);
  const repoB = extractRepoFullNameFromFinding(b);
  const typeA = extractFindingIdentityType({
    summary: a.summary,
    type: (a as any).type ?? null,
    category: extractFindingCategory(a) || null,
    source: a.source ?? null,
    location: a.location ?? null,
    details: a.details ?? null
  });
  const typeB = extractFindingIdentityType({
    summary: b.summary,
    type: (b as any).type ?? null,
    category: extractFindingCategory(b) || null,
    source: b.source ?? null,
    location: b.location ?? null,
    details: b.details ?? null
  });
  const candidateTypeA = extractCandidateTypeForMerge(a);
  const candidateTypeB = extractCandidateTypeForMerge(b);
  const ruleIdA = extractFindingRuleId(a);
  const ruleIdB = extractFindingRuleId(b);
  const kindA = extractFindingKind(a);
  const kindB = extractFindingKind(b);
  const locationExact = locationsExactMatch(a, b);
  const locationOverlap = locationsOverlapMatch(a, b);
  const semanticSimilarity = summarySimilarity(a, b);
  const semanticMatch = areFindingsSemanticallySimilar(a, b);

  return {
    dedupeKeyMatch: Boolean(dedupeKeyA && dedupeKeyB && dedupeKeyA === dedupeKeyB),
    dedupeKeyA: dedupeKeyA || null,
    dedupeKeyB: dedupeKeyB || null,
    anchorNodeIdMatch: Boolean(anchorNodeIdA && anchorNodeIdB && anchorNodeIdA === anchorNodeIdB),
    anchorNodeIdA: anchorNodeIdA || null,
    anchorNodeIdB: anchorNodeIdB || null,
    overlapGroupIdMatch: Boolean(
      overlapGroupIdA && overlapGroupIdB && overlapGroupIdA === overlapGroupIdB
    ),
    overlapGroupIdA: overlapGroupIdA || null,
    overlapGroupIdB: overlapGroupIdB || null,
    repoA: repoA || null,
    repoB: repoB || null,
    typeA: typeA || null,
    typeB: typeB || null,
    candidateTypeA: candidateTypeA || null,
    candidateTypeB: candidateTypeB || null,
    ruleIdA: ruleIdA || null,
    ruleIdB: ruleIdB || null,
    kindA: kindA || null,
    kindB: kindB || null,
    dedupCategoryA: extractDedupCategory(a) || null,
    dedupCategoryB: extractDedupCategory(b) || null,
    locationExact,
    locationOverlap,
    semanticSimilarity,
    semanticMatch
  };
}

function isRepositorySummaryDuplicate(summary: FindingLike, candidate: FindingLike): boolean {
  const repoSummary = extractRepoFullNameFromFinding(summary);
  const repoCandidate = extractRepoFullNameFromFinding(candidate);
  if (repoSummary && repoCandidate && repoSummary !== repoCandidate) {
    return false;
  }
  return areFindingsSemanticallySimilar(summary, candidate);
}

function locationsExactMatch(a: FindingLike, b: FindingLike): boolean {
  const repoA = extractRepoFullNameFromFinding(a);
  const repoB = extractRepoFullNameFromFinding(b);
  if (repoA && repoB && repoA !== repoB) {
    return false;
  }
  const locA = extractFindingLocation(a.location ?? null);
  const locB = extractFindingLocation(b.location ?? null);
  if (!locA.canonicalPath || !locB.canonicalPath) {
    return false;
  }
  if (locA.canonicalPath !== locB.canonicalPath) {
    return false;
  }
  if (locA.startLine !== null && locB.startLine !== null) {
    const endA = locA.endLine ?? locA.startLine;
    const endB = locB.endLine ?? locB.startLine;
    return locA.startLine === locB.startLine && endA === endB;
  }
  if (locA.chunkIndex !== null && locB.chunkIndex !== null) {
    return locA.chunkIndex === locB.chunkIndex;
  }
  return false;
}

function locationsOverlapMatch(a: FindingLike, b: FindingLike): boolean {
  const repoA = extractRepoFullNameFromFinding(a);
  const repoB = extractRepoFullNameFromFinding(b);
  if (repoA && repoB && repoA !== repoB) {
    return false;
  }
  const locA = extractFindingLocation(a.location ?? null);
  const locB = extractFindingLocation(b.location ?? null);
  if (!locA.canonicalPath || !locB.canonicalPath) {
    return false;
  }
  if (locA.canonicalPath !== locB.canonicalPath) {
    return false;
  }
  const hasLineA =
    locA.startLine !== null && locA.endLine !== null && locA.startLine > 0 && locA.endLine > 0;
  const hasLineB =
    locB.startLine !== null && locB.endLine !== null && locB.startLine > 0 && locB.endLine > 0;
  if (hasLineA && hasLineB) {
    return rangesOverlap(locA.startLine!, locA.endLine!, locB.startLine!, locB.endLine!);
  }
  if (locA.chunkIndex !== null && locB.chunkIndex !== null) {
    return locA.chunkIndex === locB.chunkIndex;
  }
  return false;
}

function shouldMergeFindings(a: FindingLike, b: FindingLike): boolean {
  const ruleIdA = normalizeRuleIdAlias(extractFindingRuleId(a));
  const ruleIdB = normalizeRuleIdAlias(extractFindingRuleId(b));
  const candidateTypeA = extractCandidateTypeForMerge(a);
  const candidateTypeB = extractCandidateTypeForMerge(b);
  const entryPointA = normalizeEntryPointIdentity(extractEntryPointIdentity(a));
  const entryPointB = normalizeEntryPointIdentity(extractEntryPointIdentity(b));
  const primarySymbolA = normalizeEntryPointIdentity(extractPrimarySymbolIdentity(a));
  const primarySymbolB = normalizeEntryPointIdentity(extractPrimarySymbolIdentity(b));
  const categoryA = extractDedupCategory(a);
  const categoryB = extractDedupCategory(b);
  const strictRuntimeControl = categoryA === categoryB &&
    (categoryA === "rate_limiting" || categoryA === "lockout");
  const entryPointMatch = Boolean(entryPointA && entryPointB && entryPointA === entryPointB);
  if (strictRuntimeControl && !entryPointMatch) {
    return false;
  }
  const dedupeKeyA = extractDedupeKey(a) || buildDedupeKey(a);
  const dedupeKeyB = extractDedupeKey(b) || buildDedupeKey(b);
  if (dedupeKeyA && dedupeKeyB && dedupeKeyA === dedupeKeyB) {
    return true;
  }
  if (ruleIdA && ruleIdB && ruleIdA !== ruleIdB) {
    return false;
  }
  if (candidateTypeA && candidateTypeB && candidateTypeA !== candidateTypeB) {
    return false;
  }
  if (entryPointA && entryPointB && entryPointA !== entryPointB) {
    return false;
  }
  const typeA = extractFindingIdentityType(a);
  const typeB = extractFindingIdentityType(b);
  const anchorA = extractAnchorNodeId(a);
  const anchorB = extractAnchorNodeId(b);
  if (anchorA && anchorB && anchorA === anchorB) {
    const repoA = extractRepoFullNameFromFinding(a);
    const repoB = extractRepoFullNameFromFinding(b);
    if (repoA && repoB && repoA !== repoB) {
      return false;
    }
    return true;
  }
  const overlapA = extractOverlapGroupId(a);
  const overlapB = extractOverlapGroupId(b);
  if (overlapA && overlapB && overlapA === overlapB) {
    const repoA = extractRepoFullNameFromFinding(a);
    const repoB = extractRepoFullNameFromFinding(b);
    if (repoA && repoB && repoA !== repoB) {
      return false;
    }
    if (entryPointA || entryPointB) {
      if (!entryPointA || !entryPointB || entryPointA !== entryPointB) {
        return false;
      }
    }
    if (primarySymbolA || primarySymbolB) {
      if (!primarySymbolA || !primarySymbolB || primarySymbolA !== primarySymbolB) {
        return false;
      }
    }
    return Boolean(typeA && typeB && typeA === typeB);
  }
  if (locationsOverlapMatch(a, b)) {
    const ruleMatch = Boolean(ruleIdA && ruleIdB && ruleIdA === ruleIdB);
    const typeMatch = Boolean(typeA && typeB && typeA === typeB);
    if (!ruleMatch && !typeMatch) {
      return false;
    }
  }
  if (locationsExactMatch(a, b)) {
    if (typeA && typeB && typeA === typeB) {
      return true;
    }
    const categoryA = extractDedupCategory(a);
    const categoryB = extractDedupCategory(b);
    if (categoryA && categoryB && categoryA === categoryB) {
      return true;
    }
    return false;
  }
  return areFindingsSemanticallySimilar(a, b, { requireOverlap: true, requireEntryPoint: true });
}

function mergeBlockReason(a: FindingLike, b: FindingLike): string | null {
  const ruleIdA = normalizeRuleIdAlias(extractFindingRuleId(a));
  const ruleIdB = normalizeRuleIdAlias(extractFindingRuleId(b));
  if (ruleIdA && ruleIdB && ruleIdA !== ruleIdB) {
    return "rule_id_mismatch";
  }
  const candidateTypeA = extractCandidateTypeForMerge(a);
  const candidateTypeB = extractCandidateTypeForMerge(b);
  if (candidateTypeA && candidateTypeB && candidateTypeA !== candidateTypeB) {
    return "candidate_type_mismatch";
  }
  const entryPointA = normalizeEntryPointIdentity(extractEntryPointIdentity(a));
  const entryPointB = normalizeEntryPointIdentity(extractEntryPointIdentity(b));
  if (entryPointA && entryPointB && entryPointA !== entryPointB) {
    return "entry_point_mismatch";
  }
  if ((entryPointA && !entryPointB) || (!entryPointA && entryPointB)) {
    return "entry_point_missing";
  }
  return null;
}

function shouldLogMergeSkip(a: FindingLike, b: FindingLike): boolean {
  if (!locationsOverlapMatch(a, b)) {
    return false;
  }
  return summarySimilarity(a, b) >= SUMMARY_SIMILARITY_THRESHOLD;
}

function normalizeSeverity(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed || null;
}

function severityRank(value: string | null | undefined): number {
  const normalized = normalizeSeverity(value);
  if (!normalized) return -1;
  if (normalized === "critical") return 4;
  if (normalized === "high") return 3;
  if (normalized === "medium") return 2;
  if (normalized === "low") return 1;
  if (normalized === "info") return 0;
  return -1;
}

function pickHigherSeverity(a: string | null | undefined, b: string | null | undefined): string | null {
  const rankA = severityRank(a);
  const rankB = severityRank(b);
  if (rankB > rankA) return normalizeSeverity(b);
  return normalizeSeverity(a);
}

function scoreFindingSpecificity(finding: FindingLike): number {
  const summary = typeof finding.summary === "string" ? finding.summary.trim() : "";
  const summaryTokens = summary ? summary.split(/\s+/).filter(Boolean).length : 0;
  const details = toRecord(finding.details);
  let score = summaryTokens;
  if (typeof details.snippet === "string" && details.snippet.trim()) score += 5;
  if (Array.isArray(details.evidence) && details.evidence.length > 0) score += 4;
  if (typeof details.codeAfter === "string" && details.codeAfter.trim()) score += 3;
  if (typeof details.rationale === "string" && details.rationale.trim()) score += 2;
  if (typeof details.recommendation === "string" && details.recommendation.trim()) score += 1;
  return score;
}

function collectStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string" && item.trim());
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function mergeStringArrays(...values: unknown[]): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    for (const item of collectStringArray(value)) {
      const key = item;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

function mergeLocation(target: Record<string, unknown>, incoming: Record<string, unknown>) {
  const keys = [
    "filepath",
    "filePath",
    "path",
    "file",
    "startLine",
    "start_line",
    "line",
    "endLine",
    "end_line",
    "lineEnd",
    "end",
    "chunkIndex",
    "chunk_index"
  ];
  for (const key of keys) {
    if ((target as any)[key] == null && (incoming as any)[key] != null) {
      (target as any)[key] = (incoming as any)[key];
    }
  }
}

function mergeFindingDetails(
  target: Record<string, unknown>,
  incoming: Record<string, unknown>,
  detectorIds: string[]
) {
  if (typeof target.category !== "string" && typeof incoming.category === "string") {
    target.category = incoming.category;
  }
  if (typeof target.findingType !== "string" && typeof incoming.findingType === "string") {
    target.findingType = incoming.findingType;
  }
  if (typeof target.dedupeKey !== "string" && typeof incoming.dedupeKey === "string") {
    target.dedupeKey = incoming.dedupeKey;
  }
  if (typeof target.dedupe_key !== "string" && typeof incoming.dedupe_key === "string") {
    target.dedupe_key = incoming.dedupe_key;
  }
  if (typeof target.identityKey !== "string" && typeof incoming.identityKey === "string") {
    target.identityKey = incoming.identityKey;
  }
  if (typeof target.identity_key !== "string" && typeof incoming.identity_key === "string") {
    target.identity_key = incoming.identity_key;
  }
  if (typeof target.anchorNodeId !== "string" && typeof incoming.anchorNodeId === "string") {
    target.anchorNodeId = incoming.anchorNodeId;
  }
  if (typeof target.anchor_node_id !== "string" && typeof incoming.anchor_node_id === "string") {
    target.anchor_node_id = incoming.anchor_node_id;
  }
  if (typeof target.overlapGroupId !== "string" && typeof incoming.overlapGroupId === "string") {
    target.overlapGroupId = incoming.overlapGroupId;
  }
  if (typeof target.overlap_group_id !== "string" && typeof incoming.overlap_group_id === "string") {
    target.overlap_group_id = incoming.overlap_group_id;
  }
  if (typeof target.rationale !== "string" && typeof incoming.rationale === "string") {
    target.rationale = incoming.rationale;
  }
  if (typeof target.recommendation !== "string" && typeof incoming.recommendation === "string") {
    target.recommendation = incoming.recommendation;
  }
  if (typeof target.snippet !== "string" && typeof incoming.snippet === "string") {
    target.snippet = incoming.snippet;
  }
  if (typeof target.codeAfter !== "string" && typeof incoming.codeAfter === "string") {
    target.codeAfter = incoming.codeAfter;
  }
  if (incoming.lowConfidence === true) {
    target.lowConfidence = true;
  }

  const mergedEvidence = mergeStringArrays(target.evidence, incoming.evidence);
  if (mergedEvidence.length > 0) {
    target.evidence = mergedEvidence;
  }

  const mergedDetectedBy = mergeStringArrays(target.alsoDetectedBy, incoming.alsoDetectedBy, detectorIds);
  if (mergedDetectedBy.length > 0) {
    target.alsoDetectedBy = mergedDetectedBy;
  }

  const mergedRuleIds = mergeStringArrays(
    target.mergedRuleIds,
    incoming.mergedRuleIds,
    extractFindingRuleId({ summary: "", details: target }),
    extractFindingRuleId({ summary: "", details: incoming })
  );
  if (mergedRuleIds.length > 0) {
    target.mergedRuleIds = mergedRuleIds;
  }
}

function mergeFindings<T extends FindingLike>(
  target: T,
  incoming: T,
  sourceFallback?: string
): T {
  const targetDetails = toRecord(target.details);
  const incomingDetails = toRecord(incoming.details);
  const targetLocation = toRecord(target.location);
  const incomingLocation = toRecord(incoming.location);
  if (!target.details) {
    (target as any).details = targetDetails;
  }
  if (!target.location && incoming.location) {
    (target as any).location = incoming.location;
  } else if (target.location && incoming.location) {
    mergeLocation(targetLocation, incomingLocation);
  }

  const detectorIds = mergeStringArrays(
    extractDetectorId(target, sourceFallback),
    extractDetectorId(incoming, sourceFallback)
  );
  mergeFindingDetails(targetDetails, incomingDetails, detectorIds);

  const targetScore = scoreFindingSpecificity(target);
  const incomingScore = scoreFindingSpecificity(incoming);
  if (incomingScore > targetScore && typeof incoming.summary === "string") {
    target.summary = incoming.summary;
  }
  const nextSeverity = pickHigherSeverity(target.severity, incoming.severity);
  if (nextSeverity) {
    (target as any).severity = nextSeverity;
  }
  return target;
}

function shouldKeepFinding(finding: FindingLike): boolean {
  const details = toRecord(finding.details);
  const location = toRecord(finding.location);
  const filepath = normalizeFilepath(
    (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown
  );
  const lowerFilepath = filepath.toLowerCase();
  if (lowerFilepath) {
    const ext = extensionOfPath(lowerFilepath);
    if (NON_CODE_FILE_EXTENSIONS.has(ext)) {
      if (isSecretsFinding(finding) || isDependencyFinding(finding)) {
        return true;
      }
      if (isRuntimeControlFinding(finding)) {
        return false;
      }
    }
  }

  const startLine = parsePositiveInt(
    location.startLine ?? location.start_line ?? location.line ?? location.start
  );
  if (startLine && startLine <= 1 && isMissingControlFinding(finding)) {
    if (
      lowerFilepath &&
      isAuditLoggingFinding(finding) &&
      isLikelyDestructiveFinding(finding, lowerFilepath) &&
      !isFrontendOnlyPath(lowerFilepath, details)
    ) {
      return true;
    }
    return false;
  }

  if (
    lowerFilepath &&
    isBackendOnlyControlFinding(finding) &&
    isFrontendOnlyPath(lowerFilepath, details)
  ) {
    return false;
  }

  return true;
}

export function filterFindings<T extends FindingLike>(
  findings: T[]
): { kept: T[]; dropped: number } {
  const kept: T[] = [];
  let dropped = 0;
  for (const finding of findings) {
    if (!shouldKeepFinding(finding)) {
      dropped += 1;
      continue;
    }
    kept.push(finding);
  }
  return { kept, dropped };
}

export function dropRepositorySummaryDuplicates<T extends FindingLike>(
  findings: T[],
  debug?: DedupeDebug
): { findings: T[]; dropped: number } {
  if (findings.length === 0) {
    return { findings, dropped: 0 };
  }
  const fileFindings = findings.filter((finding) => !isRepositorySummaryFinding(finding));
  if (fileFindings.length === 0) {
    return { findings, dropped: 0 };
  }

  const kept: T[] = [];
  let dropped = 0;
  for (const finding of findings) {
    if (!isRepositorySummaryFinding(finding)) {
      kept.push(finding);
      continue;
    }
    let matched: T | null = null;
    for (const candidate of fileFindings) {
      if (isRepositorySummaryDuplicate(finding, candidate)) {
        matched = candidate;
        break;
      }
    }
    if (matched) {
      if (debug) {
        logDebug(debug, {
          event: "drop_summary_duplicate",
          finding: buildDebugFinding(finding),
          matched: buildDebugFinding(matched),
          match: buildMergeDiagnostics(finding, matched)
        });
      }
      dropped += 1;
      continue;
    }
    kept.push(finding);
  }

  return { findings: kept, dropped };
}

export function dedupeFindings<T extends FindingLike>(
  findings: T[],
  sourceFallback?: string,
  debug?: DedupeDebug
): { findings: T[]; dropped: number } {
  const deduped: T[] = [];
  let dropped = 0;
  for (const [index, finding] of findings.entries()) {
    if (debug) {
      logDebug(debug, {
        event: "pre_dedupe",
        index,
        sourceFallback: sourceFallback ?? null,
        finding: buildDebugFinding(finding)
      });
    }
    let matchIndex = -1;
    let skipLogged = false;
    for (let i = 0; i < deduped.length; i += 1) {
      const existing = deduped[i];
      if (shouldMergeFindings(existing, finding)) {
        matchIndex = i;
        break;
      }
      if (debug && !skipLogged && shouldLogMergeSkip(existing, finding)) {
        const reason = mergeBlockReason(existing, finding);
        if (reason) {
          logDebug(debug, {
            event: "skip_merge",
            reason,
            existing: buildDebugFinding(existing),
            incoming: buildDebugFinding(finding),
            match: buildMergeDiagnostics(existing, finding)
          });
          skipLogged = true;
        }
      }
    }
    if (matchIndex === -1) {
      deduped.push(finding);
      continue;
    }
    const target = deduped[matchIndex];
    let targetInfo: Record<string, unknown> | null = null;
    let incomingInfo: Record<string, unknown> | null = null;
    let matchInfo: Record<string, unknown> | null = null;
    if (debug) {
      targetInfo = buildDebugFinding(target);
      incomingInfo = buildDebugFinding(finding);
      matchInfo = buildMergeDiagnostics(target, finding);
    }
    const merged = mergeFindings(target, finding, sourceFallback);
    if (debug) {
      logDebug(debug, {
        event: "merge",
        matchIndex,
        incomingIndex: index,
        match: matchInfo,
        target: targetInfo,
        incoming: incomingInfo,
        merged: buildDebugFinding(merged)
      });
    }
    deduped[matchIndex] = merged;
    dropped += 1;
  }
  return { findings: deduped, dropped };
}

function isLikelyDuplicateFinding(
  llmFinding: RepositoryScanFinding,
  existingFinding: ExistingScanFinding
): boolean {
  if (!shouldMergeFindings(llmFinding, existingFinding)) {
    return false;
  }
  return true;
}

export function dedupeRepositoryFindingsAgainstExisting(
  llmFindings: RepositoryScanFinding[],
  existingFindings: ExistingScanFinding[],
  debug?: DedupeDebug
): { findings: RepositoryScanFinding[]; dropped: number } {
  if (llmFindings.length === 0 || existingFindings.length === 0) {
    return { findings: llmFindings, dropped: 0 };
  }

  const existingByRepo = new Map<string, ExistingScanFinding[]>();
  for (const finding of existingFindings) {
    const repoFullName =
      typeof finding.repositoryFullName === "string"
        ? finding.repositoryFullName.trim()
        : "";
    if (!repoFullName) continue;
    if (!existingByRepo.has(repoFullName)) {
      existingByRepo.set(repoFullName, []);
    }
    existingByRepo.get(repoFullName)!.push(finding);
  }

  const kept: RepositoryScanFinding[] = [];
  let dropped = 0;

  for (const finding of llmFindings) {
    const repoFullName =
      typeof finding.repositoryFullName === "string"
        ? finding.repositoryFullName.trim()
        : typeof finding.details?.repositoryFullName === "string"
          ? (finding.details.repositoryFullName as string).trim()
          : "";
    const candidates = repoFullName ? existingByRepo.get(repoFullName) : null;
    if (!candidates || candidates.length === 0) {
      kept.push(finding);
      continue;
    }

    const isSummary = isRepositorySummaryFinding(finding);
    let matched: ExistingScanFinding | null = null;
    const isDuplicate = candidates.some((existing) => {
      const duplicate = isSummary
        ? isRepositorySummaryDuplicate(finding, existing)
        : isLikelyDuplicateFinding(finding, existing);
      if (duplicate) {
        matched = existing;
      }
      return duplicate;
    });
    if (isDuplicate) {
      if (debug) {
        logDebug(debug, {
          event: "drop_against_existing",
          isSummary,
          finding: buildDebugFinding(finding),
          matched: matched ? buildDebugFinding(matched) : null,
          match: matched ? buildMergeDiagnostics(finding, matched) : null
        });
      }
      dropped += 1;
      continue;
    }
    kept.push(finding);
  }

  return { findings: kept, dropped };
}

export function normalizeRepositoryFinding(
  finding: RepositoryScanFinding
): RepositoryScanFinding {
  const details = isPlainObject(finding.details) ? { ...finding.details } : {};
  const identityType = extractFindingIdentityType({ ...finding, details });
  const normalizedType = identityType || "";
  const nextType =
    normalizedType ||
    (typeof finding.type === "string" && finding.type.trim() ? finding.type.trim() : "") ||
    finding.type ||
    null;

  if (normalizedType) {
    details.findingType = normalizedType;
    details.ruleId = normalizedType;
  } else if (typeof finding.type === "string" && finding.type.trim()) {
    details.findingType = details.findingType ?? finding.type.trim();
    details.ruleId = details.ruleId ?? finding.type.trim();
  } else if (typeof details.findingType === "string") {
    const normalizedDetailType = normalizeIdentityTypeValue(details.findingType);
    if (normalizedDetailType) {
      details.findingType = normalizedDetailType;
      details.ruleId = details.ruleId ?? normalizedDetailType;
    }
  }
  if (!details.evidence && Array.isArray(finding.evidence)) {
    details.evidence = finding.evidence;
  }
  const dedupeKey = buildDedupeKey({ ...finding, type: nextType, details });
  if (dedupeKey) {
    details.dedupeKey = dedupeKey;
    details.identityKey = dedupeKey;
  }
  return {
    ...finding,
    type: nextType,
    details
  };
}
