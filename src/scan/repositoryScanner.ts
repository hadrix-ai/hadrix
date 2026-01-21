import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import type { HadrixConfig } from "../config/loadConfig.js";
import type {
  ExistingScanFinding,
  RepositoryFileSample,
  RepositoryScanFinding,
  Severity
} from "../types.js";
import { runChatCompletion } from "../providers/llm.js";
import {
  buildRepositoryCompositeSystemPrompt,
  buildRepositoryContextPrompt,
  buildRepositoryScanOutputSchema,
  buildRepositoryScanSystemPrompt
} from "./repositoryPrompts.js";
import {
  buildCandidateFindings,
  deriveFileRoleAssignments,
  summarizeFileRoles,
  type CandidateFinding,
  type FileRole,
  type FileRoleAssignment,
  REQUIRED_CONTROLS
} from "./repositoryHeuristics.js";

export interface RepositoryDescriptor {
  fullName: string;
  repoPaths: string[];
  repoRoles?: string[];
  providerMetadata?: Record<string, unknown> | null;
  defaultBranch?: string | null;
}

export interface RepositoryScanInput {
  config: HadrixConfig;
  repository: RepositoryDescriptor;
  files: RepositoryFileSample[];
  existingFindings: ExistingScanFinding[];
  mapConcurrency?: number;
}

export interface CompositeScanInput {
  config: HadrixConfig;
  repository: RepositoryDescriptor;
  files: RepositoryFileSample[];
  existingFindings: ExistingScanFinding[];
  priorFindings: RepositoryScanFinding[];
}

type FileInsight = {
  roles: FileRole[];
  requiredControls: string[];
  candidateFindings: CandidateFinding[];
};

type RepoInsights = {
  fileInsights: Map<string, FileInsight>;
  roleSummary: Record<string, number>;
  candidates: CandidateFinding[];
};

const DEFAULT_MAP_CONCURRENCY = 4;
const DEFAULT_MAX_EXISTING_FINDINGS_PER_REPO = 80;
const DEFAULT_MAX_PRIOR_FINDINGS_PER_REPO = 40;

const ENDPOINT_ROLES = new Set<FileRole>([
  "USER_READ_ENDPOINT",
  "USER_WRITE_ENDPOINT",
  "ADMIN_ENDPOINT",
  "AUTH_ENDPOINT",
  "WEBHOOK_ENDPOINT"
]);

const CANDIDATE_PROMOTION_TYPES = new Set<string>([
  "sql_injection",
  "command_injection",
  "dangerous_html_render",
  "permissive_cors",
  "debug_auth_leak",
  "missing_webhook_signature",
  "webhook_code_execution",
  "jwt_validation_bypass",
  "weak_jwt_secret",
  "weak_token_generation",
  "idor",
  "org_id_trust",
  "unsafe_query_builder",
  "anon_key_bearer",
  "missing_bearer_token",
  "sensitive_logging",
  "command_output_logging",
  "unbounded_query",
  "missing_timeout",
  "frontend_only_authorization",
  "frontend_login_rate_limit",
  "missing_rate_limiting",
  "missing_audit_logging"
]);

const CANDIDATE_PROMOTION_SUMMARY_THRESHOLD = 0.45;

const CANDIDATE_SEVERITY: Record<string, Severity> = {
  sql_injection: "high",
  command_injection: "high",
  dangerous_html_render: "high",
  permissive_cors: "medium",
  debug_auth_leak: "medium",
  missing_webhook_signature: "high",
  webhook_code_execution: "high",
  jwt_validation_bypass: "high",
  weak_jwt_secret: "high",
  weak_token_generation: "medium",
  idor: "high",
  org_id_trust: "high",
  unsafe_query_builder: "high",
  anon_key_bearer: "medium",
  missing_bearer_token: "high",
  sensitive_logging: "medium",
  command_output_logging: "medium",
  unbounded_query: "medium",
  missing_timeout: "medium",
  frontend_only_authorization: "medium",
  frontend_login_rate_limit: "medium",
  missing_rate_limiting: "medium",
  missing_audit_logging: "medium"
};

const CANDIDATE_CATEGORY: Record<string, string> = {
  sql_injection: "injection",
  command_injection: "injection",
  dangerous_html_render: "injection",
  permissive_cors: "configuration",
  debug_auth_leak: "authentication",
  missing_webhook_signature: "authentication",
  webhook_code_execution: "authentication",
  jwt_validation_bypass: "authentication",
  weak_jwt_secret: "authentication",
  weak_token_generation: "authentication",
  idor: "access_control",
  org_id_trust: "access_control",
  unsafe_query_builder: "injection",
  anon_key_bearer: "authentication",
  missing_bearer_token: "authentication",
  sensitive_logging: "secrets",
  command_output_logging: "secrets",
  unbounded_query: "configuration",
  missing_timeout: "configuration",
  frontend_only_authorization: "access_control",
  frontend_login_rate_limit: "authentication",
  missing_rate_limiting: "configuration",
  missing_audit_logging: "configuration"
};

export async function scanRepository(input: RepositoryScanInput): Promise<RepositoryScanFinding[]> {
  if (input.files.length === 0) {
    return [];
  }

  const outputSchema = buildRepositoryScanOutputSchema();
  const systemPrompt = buildRepositoryScanSystemPrompt();
  const systemContext = buildRepositoryContextPrompt([input.repository]);
  const combinedSystemPrompt = [systemPrompt, systemContext].filter(Boolean).join("\n\n");

  const insights = buildFileInsights(input.files);
  const existingFindings = pickExistingFindings(
    input.existingFindings,
    DEFAULT_MAX_EXISTING_FINDINGS_PER_REPO
  );

  const tasks = input.files.map((file) => ({
    file,
    fileInsight: insights.fileInsights.get(file.path),
    roleSummary: insights.roleSummary,
    existingFindings
  }));

  const mapConcurrency = normalizeMapConcurrency(input.mapConcurrency);
  const results = await runWithConcurrency(tasks, mapConcurrency, async (task) => {
    const { file, fileInsight, roleSummary, existingFindings: existing } = task;
    const fallbackAssignments = fileInsight ? null : deriveFileRoleAssignments([file]);
    const fallbackAssignment = fallbackAssignments?.[0];
    const roles = fileInsight?.roles ?? fallbackAssignment?.roles ?? [];
    const requiredControls = fileInsight?.requiredControls ?? fallbackAssignment?.requiredControls ?? [];
    const candidateFindings =
      fileInsight?.candidateFindings ??
      (fallbackAssignments ? buildCandidateFindings([file], fallbackAssignments) : []);

    const filePayload = {
      path: file.path,
      startLine: file.startLine,
      endLine: file.endLine,
      chunkIndex: file.chunkIndex,
      truncated: file.truncated ?? false,
      content: file.content,
      roles: roles.length ? roles : undefined,
      requiredControls: requiredControls.length ? requiredControls : undefined
    };

    const payload = {
      outputSchema,
      requiredControlsByRole: REQUIRED_CONTROLS,
      repositories: [
        {
          fullName: input.repository.fullName,
          defaultBranch: input.repository.defaultBranch ?? undefined,
          metadata: input.repository.providerMetadata ?? undefined,
          repoPaths: input.repository.repoPaths,
          repoRoles: input.repository.repoRoles,
          existingFindings: existing.length ? existing : undefined,
          fileRoleSummary: Object.keys(roleSummary).length ? roleSummary : undefined,
          candidateFindings: candidateFindings.length ? candidateFindings : undefined,
          files: [filePayload]
        }
      ],
      focus:
        "Identify missing or incomplete security controls (authz, tenant isolation, rate limiting, audit logging, timeouts) and other high-impact vulnerabilities."
    };

    const response = await runChatCompletion(input.config, [
      { role: "system", content: combinedSystemPrompt },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]);

    try {
      return parseFindings(response, input.repository, {
        requireFilepath: true,
        defaultLocation: {
          filepath: file.path,
          startLine: file.startLine,
          endLine: file.endLine,
          chunkIndex: file.chunkIndex
        }
      });
    } catch (err) {
      const savedPath = await writeLlmDebugArtifact(
        input.config,
        "llm-map",
        response
      );
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`${message} (saved raw response to ${savedPath})`);
    }
  });

  const llmFindings = results.flatMap((result) => result);
  const promoted = promoteCandidateFindings({
    repository: input.repository,
    insights,
    llmFindings,
    existingFindings
  });
  const reduced = reduceRepositoryFindings([...llmFindings, ...promoted]);
  return reduced;
}

export async function scanRepositoryComposites(
  input: CompositeScanInput
): Promise<RepositoryScanFinding[]> {
  if (input.files.length === 0) {
    return [];
  }

  const outputSchema = buildRepositoryScanOutputSchema();
  const systemPrompt = buildRepositoryCompositeSystemPrompt();
  const systemContext = buildRepositoryContextPrompt([input.repository]);
  const combinedSystemPrompt = [systemPrompt, systemContext].filter(Boolean).join("\n\n");

  const existingFindings = pickExistingFindings(
    input.existingFindings,
    DEFAULT_MAX_EXISTING_FINDINGS_PER_REPO
  );
  const priorFindings = pickPriorFindings(
    input.priorFindings,
    DEFAULT_MAX_PRIOR_FINDINGS_PER_REPO
  );

  const roleAssignments = deriveFileRoleAssignments(input.files);
  const roleSummary = summarizeFileRoles(roleAssignments);
  const fileRoles = roleAssignments.map((assignment) => ({
    path: assignment.path,
    roles: assignment.roles,
    requiredControls: assignment.requiredControls
  }));

  const payload = {
    outputSchema,
    requiredControlsByRole: REQUIRED_CONTROLS,
    repositories: [
      {
        fullName: input.repository.fullName,
        defaultBranch: input.repository.defaultBranch ?? undefined,
        metadata: input.repository.providerMetadata ?? undefined,
        repoPaths: input.repository.repoPaths,
        repoRoles: input.repository.repoRoles,
        existingFindings: existingFindings.length ? existingFindings : undefined,
        priorFindings: priorFindings.length ? priorFindings : undefined,
        fileRoleSummary: Object.keys(roleSummary).length ? roleSummary : undefined,
        fileRoles: fileRoles.length ? fileRoles : undefined
      }
    ]
  };

  const response = await runChatCompletion(input.config, [
    { role: "system", content: combinedSystemPrompt },
    { role: "user", content: JSON.stringify(payload, null, 2) }
  ]);

  try {
    return parseFindings(response, input.repository, { requireFilepath: false });
  } catch (err) {
    const savedPath = await writeLlmDebugArtifact(
      input.config,
      "llm-composite",
      response
    );
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${message} (saved raw response to ${savedPath})`);
  }
}

function normalizeMapConcurrency(value?: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  return DEFAULT_MAP_CONCURRENCY;
}

async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  runner: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.trunc(concurrency));
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await runner(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

function buildFileInsights(files: RepositoryFileSample[]): RepoInsights {
  const fileInsights = new Map<string, FileInsight>();
  if (!files || files.length === 0) {
    return { fileInsights, roleSummary: {}, candidates: [] };
  }

  const assignments = deriveFileRoleAssignments(files);
  const rolesByPath = new Map<string, Set<FileRole>>();
  const controlsByPath = new Map<string, Set<string>>();

  for (const assignment of assignments) {
    const path = normalizePath(assignment.path);
    if (!path) {
      continue;
    }
    if (!rolesByPath.has(path)) {
      rolesByPath.set(path, new Set<FileRole>());
    }
    const roleSet = rolesByPath.get(path)!;
    for (const role of assignment.roles) {
      roleSet.add(role);
    }
    if (!controlsByPath.has(path)) {
      controlsByPath.set(path, new Set<string>());
    }
    const controlSet = controlsByPath.get(path)!;
    for (const control of assignment.requiredControls) {
      controlSet.add(control);
    }
  }

  const unionAssignments: FileRoleAssignment[] = [];
  for (const [path, roleSet] of rolesByPath) {
    const roles = Array.from(roleSet);
    const requiredControls = Array.from(controlsByPath.get(path) ?? new Set<string>());
    unionAssignments.push({ path, roles, requiredControls });
    fileInsights.set(path, { roles, requiredControls, candidateFindings: [] });
  }

  const candidates = buildCandidateFindings(files, unionAssignments);
  const candidatesByPath = new Map<string, CandidateFinding[]>();
  for (const candidate of candidates) {
    const candidatePath =
      typeof candidate.filepath === "string"
        ? normalizePath(candidate.filepath)
        : "";
    if (!candidatePath) {
      continue;
    }
    if (!candidatesByPath.has(candidatePath)) {
      candidatesByPath.set(candidatePath, []);
    }
    candidatesByPath.get(candidatePath)!.push(candidate);
  }

  for (const [path, candidatesForPath] of candidatesByPath) {
    const insight = fileInsights.get(path) ?? {
      roles: [],
      requiredControls: [],
      candidateFindings: []
    };
    insight.candidateFindings = candidatesForPath;
    fileInsights.set(path, insight);
  }

  const roleSummary = summarizeFileRoles(unionAssignments);
  return { fileInsights, roleSummary, candidates };
}

function promoteCandidateFindings(args: {
  repository: RepositoryDescriptor;
  insights: RepoInsights;
  llmFindings: RepositoryScanFinding[];
  existingFindings: ExistingScanFinding[];
}): RepositoryScanFinding[] {
  const { repository, insights, llmFindings, existingFindings } = args;
  const candidateIndex = new Map<string, CandidateFinding>();

  for (const insight of insights.fileInsights.values()) {
    for (const candidate of insight.candidateFindings) {
      const filepath =
        typeof candidate.filepath === "string"
          ? normalizePath(candidate.filepath)
          : "";
      if (!filepath) continue;
      const typeKey = typeof candidate.type === "string" ? candidate.type.trim() : "";
      const key = `${typeKey}|${filepath}|${candidate.summary}`;
      if (!candidateIndex.has(key)) {
        candidateIndex.set(key, { ...candidate, filepath });
      }
    }
  }

  if (candidateIndex.size === 0) {
    return [];
  }

  const promoted: RepositoryScanFinding[] = [];
  for (const candidate of candidateIndex.values()) {
    if (!shouldPromoteCandidate(candidate)) {
      continue;
    }
    if (isCandidateCovered(candidate, llmFindings, existingFindings)) {
      continue;
    }
    const finding = buildFindingFromCandidate(candidate, repository);
    if (finding) {
      promoted.push(finding);
    }
  }

  return promoted;
}

function shouldPromoteCandidate(candidate: CandidateFinding): boolean {
  const typeKey = typeof candidate.type === "string" ? candidate.type.trim().toLowerCase() : "";
  if (!typeKey || !CANDIDATE_PROMOTION_TYPES.has(typeKey)) {
    return false;
  }
  if (typeKey === "missing_rate_limiting") {
    return shouldPromoteRateLimitCandidate(candidate);
  }
  if (typeKey === "missing_audit_logging") {
    return shouldPromoteAuditCandidate(candidate);
  }
  return true;
}

function shouldPromoteRateLimitCandidate(candidate: CandidateFinding): boolean {
  const roles = candidate.relatedFileRoles ?? [];
  if (roles.includes("AUTH_ENDPOINT") || roles.includes("ADMIN_ENDPOINT")) {
    return true;
  }
  const filepath =
    typeof candidate.filepath === "string" ? candidate.filepath.toLowerCase() : "";
  const text = `${candidate.summary ?? ""} ${filepath} ${collectEvidenceText(candidate)}`.toLowerCase();
  return /(token|login|signin|signup|auth|password|reset|invite|delete|admin)/i.test(text);
}

function shouldPromoteAuditCandidate(candidate: CandidateFinding): boolean {
  const roles = candidate.relatedFileRoles ?? [];
  if (roles.includes("ADMIN_ENDPOINT")) {
    return true;
  }
  const text = `${candidate.summary ?? ""} ${collectEvidenceText(candidate)}`.toLowerCase();
  return /(delete|destroy|revoke|admin)/i.test(text);
}

function collectEvidenceText(candidate: CandidateFinding): string {
  const parts: string[] = [];
  for (const item of candidate.evidence ?? []) {
    if (typeof item.excerpt === "string") {
      parts.push(item.excerpt);
    }
    if (typeof item.note === "string") {
      parts.push(item.note);
    }
  }
  return parts.join(" ");
}

function isCandidateCovered(
  candidate: CandidateFinding,
  llmFindings: RepositoryScanFinding[],
  existingFindings: ExistingScanFinding[]
): boolean {
  const candidatePath =
    typeof candidate.filepath === "string" ? normalizePath(candidate.filepath) : "";
  if (!candidatePath) {
    return false;
  }
  const candidateType = typeof candidate.type === "string" ? candidate.type.trim().toLowerCase() : "";
  const candidateTokens = summaryTokenSet(candidate.summary ?? "");

  for (const finding of llmFindings) {
    const filepath = extractFindingPath(finding);
    if (!filepath || filepath !== candidatePath) {
      continue;
    }
    const findingType = normalizeFindingTypeKey(finding);
    if (candidateType && findingType && candidateType === findingType) {
      return true;
    }
    if (isSummarySimilar(candidateTokens, finding.summary ?? "")) {
      return true;
    }
  }

  for (const finding of existingFindings ?? []) {
    const filepath = extractExistingFindingPath(finding);
    if (!filepath || filepath !== candidatePath) {
      continue;
    }
    const details = toRecord(finding.details);
    const findingType = normalizeFindingTypeKeyFromValues(finding.type, details);
    if (candidateType && findingType && candidateType === findingType) {
      return true;
    }
    if (isSummarySimilar(candidateTokens, finding.summary ?? "")) {
      return true;
    }
  }

  return false;
}

function buildFindingFromCandidate(
  candidate: CandidateFinding,
  repository: RepositoryDescriptor
): RepositoryScanFinding | null {
  const filepath =
    typeof candidate.filepath === "string" ? normalizePath(candidate.filepath) : "";
  if (!filepath) {
    return null;
  }
  const typeKey = typeof candidate.type === "string" ? candidate.type.trim() : "";
  const severity = CANDIDATE_SEVERITY[typeKey] ?? "medium";
  const evidence = buildCandidateEvidence(candidate);
  const details: Record<string, unknown> = {
    rationale: candidate.rationale,
    category: CANDIDATE_CATEGORY[typeKey] ?? "other",
    heuristic: true,
    candidateType: candidate.type,
    candidateId: candidate.id
  };
  if (evidence.length > 0) {
    details.evidence = evidence;
  }

  const location = buildCandidateLocation(candidate, repository);
  return {
    repositoryFullName: repository.fullName,
    type: typeKey || undefined,
    severity,
    summary: candidate.summary,
    evidence: evidence.length > 0 ? evidence : undefined,
    details,
    location
  };
}

function buildCandidateEvidence(candidate: CandidateFinding): string[] {
  const evidence: string[] = [];
  for (const item of candidate.evidence ?? []) {
    if (!item) continue;
    const note = typeof item.note === "string" ? item.note.trim() : "";
    const excerpt = typeof item.excerpt === "string" ? item.excerpt.trim() : "";
    const parts = [note, excerpt].filter(Boolean);
    if (parts.length > 0) {
      evidence.push(parts.join(" - "));
    }
  }
  return evidence;
}

function buildCandidateLocation(
  candidate: CandidateFinding,
  repository: RepositoryDescriptor
): Record<string, unknown> | null {
  const filepath =
    typeof candidate.filepath === "string" ? normalizePath(candidate.filepath) : "";
  if (!filepath) {
    return null;
  }

  const evidenceLine = (candidate.evidence ?? []).find(
    (item) => typeof item.startLine === "number" && Number.isFinite(item.startLine)
  );
  const startLine =
    typeof evidenceLine?.startLine === "number" ? Math.trunc(evidenceLine.startLine) : null;
  const endLine =
    typeof evidenceLine?.endLine === "number" && Number.isFinite(evidenceLine.endLine)
      ? Math.trunc(evidenceLine.endLine)
      : startLine;

  const location: Record<string, unknown> = { filepath };
  const repoPaths = repository.repoPaths ?? [];
  const repoPath = selectRepoPathForFile(filepath, repoPaths);
  if (repoPath) {
    location.repoPath = repoPath;
  }
  if (startLine !== null) {
    location.startLine = startLine;
  }
  if (endLine !== null) {
    location.endLine = endLine;
  }

  return location;
}

function selectRepoPathForFile(filepath: string, repoPaths: string[]): string {
  let match = "";
  for (const path of repoPaths) {
    if (!path) continue;
    if (filepath === path || filepath.startsWith(`${path}/`)) {
      if (path.length > match.length) {
        match = path;
      }
    }
  }
  return match;
}

function parseFindings(
  raw: string,
  repository: RepositoryDescriptor,
  options?: {
    requireFilepath?: boolean;
    defaultLocation?: {
      filepath: string;
      startLine?: number;
      endLine?: number;
      chunkIndex?: number;
    };
  }
): RepositoryScanFinding[] {
  if (!raw) return [];
  const requireFilepath = options?.requireFilepath ?? false;
  const parsed = extractJson(raw);

  const findingsArray: any[] = Array.isArray(parsed?.findings)
    ? parsed.findings
    : Array.isArray(parsed)
      ? parsed
      : [];

  const findings: RepositoryScanFinding[] = [];
  for (const item of findingsArray) {
    const summary = typeof item?.summary === "string" ? item.summary.trim() : "";
    if (!summary) {
      continue;
    }
    const severity = normalizeSeverity(item?.severity);
    const location =
      item?.location && typeof item.location === "object" && !Array.isArray(item.location)
        ? (item.location as Record<string, unknown>)
        : null;
    const mergedLocation = applyLocationFallback(location, options?.defaultLocation);
    const normalizedLocation = normalizeFindingLocation(mergedLocation);
    const filepath =
      typeof normalizedLocation?.filepath === "string" ? normalizedLocation.filepath.trim() : "";
    if (requireFilepath && !filepath) {
      continue;
    }

    const details = toRecord(item?.details);
    const type = normalizeFindingType(item?.type ?? details.type ?? details.category);
    const evidence = mergeStringArrays(
      normalizeEvidence(details.evidence),
      normalizeEvidence(item?.evidence)
    );

    if (repository.fullName && !details.repositoryFullName) {
      details.repositoryFullName = repository.fullName;
    }
    if (evidence.length > 0 && (!details.evidence || typeof details.evidence === "string" || Array.isArray(details.evidence))) {
      details.evidence = evidence;
    }

    findings.push({
      repositoryFullName: repository.fullName,
      type: type ?? undefined,
      severity,
      summary,
      evidence: evidence.length > 0 ? evidence : undefined,
      details,
      location: normalizedLocation
    });
  }
  return findings;
}

function extractJson(raw: string): any {
  const text = raw.trim();
  if (!text) {
    return {};
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    return safeParseJson(fenced[1].trim());
  }

  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return safeParseJson(text.slice(firstBrace, lastBrace + 1));
  }

  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return safeParseJson(text.slice(firstBracket, lastBracket + 1));
  }

  return safeParseJson(text);
}

function safeParseJson(raw: string): any {
  try {
    const cleaned = stripJsonComments(raw);
    return JSON.parse(cleaned);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM returned invalid JSON: ${message}`);
  }
}

function stripJsonComments(input: string): string {
  let output = "";
  let inString = false;
  let escape = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i] ?? "";
    const next = input[i + 1] ?? "";
    if (!inString && char === "/" && next === "/") {
      i += 1;
      while (i + 1 < input.length && input[i + 1] !== "\n") {
        i += 1;
      }
      continue;
    }
    if (!inString && char === "/" && next === "*") {
      i += 1;
      while (i + 1 < input.length) {
        if (input[i] === "*" && input[i + 1] === "/") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    output += char;
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
    }
  }
  return output;
}

function applyLocationFallback(
  location: Record<string, unknown> | null,
  fallback?: {
    filepath: string;
    startLine?: number;
    endLine?: number;
    chunkIndex?: number;
  }
): Record<string, unknown> | null {
  if (!fallback) {
    return location;
  }
  const merged: Record<string, unknown> = { ...(location ?? {}) };
  if (!hasLocationFilepath(merged)) {
    merged.filepath = normalizePath(fallback.filepath);
  }
  if (!hasLocationLineInfo(merged) && typeof fallback.startLine === "number") {
    merged.startLine = fallback.startLine;
  }
  if (merged.chunkIndex == null && typeof fallback.chunkIndex === "number") {
    merged.chunkIndex = fallback.chunkIndex;
  }
  return merged;
}

function hasLocationFilepath(location: Record<string, unknown>): boolean {
  const raw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  if (typeof raw !== "string") return false;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (isPlaceholderPath(trimmed)) return false;
  return true;
}

function isPlaceholderPath(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("path/to/") ||
    lower.includes("path\\to\\") ||
    lower.includes("placeholder")
  );
}

function hasLocationLineInfo(location: Record<string, unknown>): boolean {
  return (
    normalizeLineNumber(location.startLine ?? location.start_line ?? location.line ?? location.start) !== null ||
    normalizeLineNumber(location.endLine ?? location.end_line ?? location.lineEnd ?? location.end) !== null
  );
}

function normalizeFindingLocation(
  location: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!location) return null;
  const normalized: Record<string, unknown> = { ...location };

  const filepathRaw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  const filepath = typeof filepathRaw === "string" ? normalizePath(filepathRaw) : "";

  if (filepath && !isPlaceholderPath(filepath)) {
    normalized.filepath = filepath;
  } else {
    delete normalized.filepath;
  }

  const startLine = normalizeLineNumber(
    location.startLine ?? location.start_line ?? location.line ?? location.start
  );
  const endLine = normalizeLineNumber(
    location.endLine ?? location.end_line ?? location.lineEnd ?? location.end
  );
  const normalizedStart = startLine ?? endLine ?? null;
  let normalizedEnd = endLine ?? normalizedStart;
  if (normalizedStart !== null && normalizedEnd !== null && normalizedEnd < normalizedStart) {
    normalizedEnd = normalizedStart;
  }
  if (normalizedStart !== null) {
    normalized.startLine = normalizedStart;
  } else {
    delete normalized.startLine;
  }
  if (normalizedEnd !== null) {
    normalized.endLine = normalizedEnd;
  } else {
    delete normalized.endLine;
  }

  const chunkIndex = normalizeChunkIndex(location.chunkIndex ?? (location as any).chunk_index);
  if (chunkIndex !== null) {
    normalized.chunkIndex = chunkIndex;
  } else {
    delete normalized.chunkIndex;
  }

  delete (normalized as any).filePath;
  delete (normalized as any).path;
  delete (normalized as any).file;
  delete (normalized as any).start_line;
  delete (normalized as any).line;
  delete (normalized as any).start;
  delete (normalized as any).end_line;
  delete (normalized as any).lineEnd;
  delete (normalized as any).end;
  delete (normalized as any).chunk_index;

  return normalized;
}

export function reduceRepositoryFindings(findings: RepositoryScanFinding[]): RepositoryScanFinding[] {
  if (findings.length === 0) {
    return [];
  }

  const deduped = new Map<string, RepositoryScanFinding>();
  const passthrough: RepositoryScanFinding[] = [];

  for (const finding of findings) {
    const fingerprint = repositoryFindingFingerprint(finding);
    if (!fingerprint) {
      passthrough.push(finding);
      continue;
    }
    const existing = deduped.get(fingerprint);
    if (!existing) {
      deduped.set(fingerprint, finding);
      continue;
    }
    deduped.set(fingerprint, mergeRepositoryFindings(existing, finding));
  }

  const combined = [...deduped.values(), ...passthrough];
  combined.sort(compareFindingsBySeverity);
  return combined;
}

function repositoryFindingFingerprint(finding: RepositoryScanFinding): string | null {
  return buildLocationFingerprint({
    location: toRecord(finding.location),
    typeKey: normalizeFindingTypeKey(finding)
  });
}

function mergeRepositoryFindings(
  left: RepositoryScanFinding,
  right: RepositoryScanFinding
): RepositoryScanFinding {
  const leftRank = severityRank(left.severity);
  const rightRank = severityRank(right.severity);
  const winner = rightRank > leftRank ? right : left;
  const loser = winner === right ? left : right;
  const winnerDetails = toRecord(winner.details);
  const loserDetails = toRecord(loser.details);
  const mergedDetails = {
    ...loserDetails,
    ...winnerDetails
  } as Record<string, unknown>;

  const mergedEvidence = mergeStringArrays(
    toStringArray(loser.evidence),
    toStringArray(winner.evidence),
    toStringArray(mergedDetails.evidence)
  );
  if (mergedEvidence.length > 0 && (!mergedDetails.evidence || typeof mergedDetails.evidence === "string" || Array.isArray(mergedDetails.evidence))) {
    mergedDetails.evidence = mergedEvidence;
  }

  return {
    repositoryFullName: winner.repositoryFullName ?? loser.repositoryFullName,
    type: winner.type ?? loser.type ?? null,
    severity: winner.severity,
    summary: winner.summary,
    evidence: mergedEvidence.length > 0 ? mergedEvidence : winner.evidence ?? loser.evidence,
    details: mergedDetails,
    location: mergeFindingLocation(winner.location, loser.location)
  };
}

function mergeFindingLocation(
  primary?: Record<string, unknown> | null,
  secondary?: Record<string, unknown> | null
): Record<string, unknown> | null {
  const primaryRecord = toRecord(primary);
  const secondaryRecord = toRecord(secondary);
  const merged = { ...secondaryRecord, ...primaryRecord };
  return Object.keys(merged).length > 0 ? merged : null;
}

function compareFindingsBySeverity(a: RepositoryScanFinding, b: RepositoryScanFinding): number {
  const rankDiff = severityRank(b.severity) - severityRank(a.severity);
  if (rankDiff !== 0) {
    return rankDiff;
  }
  const summaryDiff = (a.summary ?? "").localeCompare(b.summary ?? "");
  if (summaryDiff !== 0) {
    return summaryDiff;
  }
  const pathDiff = extractFindingPath(a).localeCompare(extractFindingPath(b));
  if (pathDiff !== 0) {
    return pathDiff;
  }
  return normalizeFindingTypeKey(a).localeCompare(normalizeFindingTypeKey(b));
}

function extractFindingPath(finding: RepositoryScanFinding): string {
  const location = toRecord(finding.location);
  const filepathRaw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  return typeof filepathRaw === "string" ? normalizePath(filepathRaw) : "";
}

function extractExistingFindingPath(finding: ExistingScanFinding): string {
  const location = toRecord(finding.location);
  const raw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  return typeof raw === "string" ? normalizePath(raw) : "";
}

function normalizeFindingType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeFindingTypeKey(finding: RepositoryScanFinding): string {
  const details = toRecord(finding.details);
  return normalizeFindingTypeKeyFromValues(finding.type, details);
}

function normalizeFindingTypeKeyFromValues(typeValue: unknown, details: Record<string, unknown>): string {
  const type =
    normalizeFindingType(typeValue) ??
    normalizeFindingType(details.type) ??
    normalizeFindingType(details.category);
  return type ? type.toLowerCase() : "";
}

function summaryTokenSet(value: string): Set<string> {
  if (!value) return new Set<string>();
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return new Set<string>();
  return new Set(normalized.split(" ").filter(Boolean));
}

function isSummarySimilar(candidateTokens: Set<string>, summary: string): boolean {
  const summaryTokens = summaryTokenSet(summary);
  if (candidateTokens.size === 0 || summaryTokens.size === 0) {
    return false;
  }
  const score = jaccard(candidateTokens, summaryTokens);
  return score >= CANDIDATE_PROMOTION_SUMMARY_THRESHOLD;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function normalizeSeverity(value: unknown): Severity {
  const str = typeof value === "string" ? value.toLowerCase() : "";
  switch (str) {
    case "critical":
    case "sev0":
    case "p0":
      return "critical";
    case "high":
    case "sev1":
    case "p1":
      return "high";
    case "low":
    case "sev3":
    case "p3":
    case "minor":
    case "info":
    case "informational":
    case "note":
      return "low";
    case "medium":
    case "moderate":
    case "sev2":
    case "p2":
    default:
      return "medium";
  }
}

function severityRank(value: unknown): number {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  switch (normalized) {
    case "critical":
      return 5;
    case "high":
      return 4;
    case "medium":
      return 3;
    case "low":
      return 2;
    case "info":
      return 1;
    default:
      return 0;
  }
}

function normalizeLineNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const num = Math.trunc(value);
    return num > 0 ? num : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      const num = Math.trunc(parsed);
      return num > 0 ? num : null;
    }
  }
  return null;
}

function normalizeChunkIndex(value: unknown): number | null {
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

function normalizeEvidence(value: unknown): string[] {
  return toStringArray(value);
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === "string" ? item.trim() : ""))
      .filter(Boolean);
  }
  return [];
}

function mergeStringArrays(...lists: string[][]): string[] {
  const merged = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      const trimmed = item.trim();
      if (trimmed) {
        merged.add(trimmed);
      }
    }
  }
  return Array.from(merged);
}

function pickExistingFindings(findings: ExistingScanFinding[], maxFindings: number): ExistingScanFinding[] {
  if (maxFindings <= 0) {
    return [];
  }

  const candidates: ExistingScanFinding[] = [];
  const byFingerprint = new Set<string>();
  for (const finding of findings) {
    const fingerprint = existingFindingFingerprint(finding);
    if (!fingerprint || byFingerprint.has(fingerprint)) {
      continue;
    }
    byFingerprint.add(fingerprint);
    candidates.push(finding);
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));

  return candidates.slice(0, maxFindings).map((finding) => sanitizeExistingFinding(finding));
}

function existingFindingFingerprint(finding: ExistingScanFinding): string {
  return (
    buildLocationFingerprint({
      location: toRecord(finding.location),
      typeKey: normalizeFindingTypeKeyFromValues(finding.type, toRecord(finding.details))
    }) ?? ""
  );
}

function sanitizeExistingFinding(finding: ExistingScanFinding): ExistingScanFinding {
  const location = toRecord(finding.location);
  const details = toRecord(finding.details);

  const filepathRaw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  const filepath = typeof filepathRaw === "string" ? normalizePath(filepathRaw) : null;

  const startLine = normalizeLineNumber(location.startLine ?? location.start_line ?? location.line);
  const endLine = normalizeLineNumber(location.endLine ?? location.end_line ?? location.lineEnd ?? location.end);

  const tool = typeof details.tool === "string" ? details.tool : null;
  const ruleId = typeof details.ruleId === "string" ? details.ruleId : null;
  const safeDetails = tool || ruleId ? { ...(tool ? { tool } : {}), ...(ruleId ? { ruleId } : {}) } : null;

  return {
    type: typeof finding.type === "string" ? finding.type : null,
    source: typeof finding.source === "string" ? finding.source : null,
    severity: finding.severity ?? null,
    summary: finding.summary,
    location: filepath || startLine || endLine ? { filepath, startLine, endLine } : null,
    details: safeDetails
  };
}

function pickPriorFindings(findings: RepositoryScanFinding[], maxFindings: number): RepositoryScanFinding[] {
  if (maxFindings <= 0) {
    return [];
  }

  const candidates: RepositoryScanFinding[] = [];
  const byFingerprint = new Set<string>();
  for (const finding of findings) {
    const fingerprint = repositoryFindingFingerprint(finding);
    if (!fingerprint || byFingerprint.has(fingerprint)) {
      continue;
    }
    byFingerprint.add(fingerprint);
    candidates.push(finding);
  }

  if (candidates.length === 0) {
    return [];
  }

  candidates.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
  return candidates.slice(0, maxFindings).map((finding) => sanitizePriorFinding(finding));
}

function sanitizePriorFinding(finding: RepositoryScanFinding): RepositoryScanFinding {
  const location = toRecord(finding.location);
  const details = toRecord(finding.details);

  const filepathRaw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  const filepath = typeof filepathRaw === "string" ? normalizePath(filepathRaw) : null;

  const startLine = normalizeLineNumber(location.startLine ?? location.start_line ?? location.line);
  const endLine = normalizeLineNumber(location.endLine ?? location.end_line ?? location.lineEnd ?? location.end);

  return {
    repositoryFullName: finding.repositoryFullName,
    severity: finding.severity,
    summary: finding.summary,
    location: filepath || startLine || endLine ? { filepath, startLine, endLine } : null,
    details
  };
}

function buildLocationFingerprint(args: {
  location: Record<string, unknown> | null;
  typeKey: string;
}): string | null {
  const typeKey = args.typeKey.trim().toLowerCase();
  if (!typeKey || !args.location) {
    return null;
  }

  const normalizedLocation = normalizeFindingLocation(args.location);
  if (!normalizedLocation) {
    return null;
  }

  const filepathRaw = normalizedLocation.filepath as unknown;
  const filepath = typeof filepathRaw === "string" ? normalizePath(filepathRaw) : "";
  if (!filepath) {
    return null;
  }

  const startLine = normalizeLineNumber(normalizedLocation.startLine);
  const endLine = normalizeLineNumber(normalizedLocation.endLine);
  const chunkIndex = normalizeChunkIndex((normalizedLocation as any).chunkIndex);
  let anchor: string | null = null;
  if (startLine || endLine) {
    const start = startLine ?? endLine ?? 0;
    let end = endLine ?? start;
    if (end < start) {
      end = start;
    }
    anchor = `lines:${start}-${end}`;
  } else if (chunkIndex !== null) {
    anchor = `chunk:${chunkIndex}`;
  }
  if (!anchor) {
    return null;
  }

  return `${filepath}|${anchor}|${typeKey}`;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\/*/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

async function writeLlmDebugArtifact(
  config: HadrixConfig,
  label: string,
  response: string
): Promise<string> {
  const dir = path.join(config.stateDir, "llm-errors");
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  const filename = `${label}-${timestamp}-${suffix}.txt`;
  const filePath = path.join(dir, filename);
  const content = [
    "LLM response (raw):",
    "",
    response
  ].join("\n");
  await writeFile(filePath, content, "utf-8");
  const relative = path.relative(process.cwd(), filePath);
  return relative && !relative.startsWith("..") ? relative : filePath;
}
