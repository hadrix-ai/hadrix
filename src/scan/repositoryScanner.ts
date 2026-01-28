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
  buildRepositoryRuleSystemPrompt
} from "./repositoryPrompts.js";
import { REPOSITORY_SCAN_RULES, type RuleScanDefinition } from "./repositoryRuleCatalog.js";
import {
  buildCandidateFindings,
  deriveFileRoleAssignments,
  deriveFileScopeAssignments,
  evaluateCandidateGate,
  evaluateControlGate,
  filterRequiredControls,
  summarizeFileRoles,
  type CandidateFinding,
  type FileRole,
  type FileRoleAssignment,
  type FileScope,
  type FileScopeEvidence,
  type RuleGateCheck,
  type RuleGateMismatch,
  REQUIRED_CONTROLS
} from "./repositoryHeuristics.js";
import {
  buildFindingIdentityKey,
  extractFindingIdentityType
} from "./dedupeKey.js";
import type { DedupeDebug } from "./debugLog.js";

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
  debug?: DedupeDebug;
}

export interface CompositeScanInput {
  config: HadrixConfig;
  repository: RepositoryDescriptor;
  files: RepositoryFileSample[];
  existingFindings: ExistingScanFinding[];
  priorFindings: RepositoryScanFinding[];
  debug?: DedupeDebug;
}

type FileInsight = {
  roles: FileRole[];
  requiredControls: string[];
  candidateFindings: CandidateFinding[];
  scope?: FileScope;
  scopeEvidence?: FileScopeEvidence;
};

type RepoInsights = {
  fileInsights: Map<string, FileInsight>;
  roleSummary: Record<string, number>;
  candidates: CandidateFinding[];
};

type ResolvedFileContext = {
  roles: FileRole[];
  requiredControls: string[];
  candidateFindings: CandidateFinding[];
  scope?: FileScope;
  scopeEvidence?: FileScopeEvidence;
};

type RuleScanTask = {
  rule: RuleScanDefinition;
  file: RepositoryFileSample;
  fileContext: ResolvedFileContext;
  systemPrompt: string;
  roleSummary: Record<string, number>;
  existingFindings: ExistingScanFinding[];
};

type ScopeGateAction = "allow" | "suppress" | "downgrade";

type ScopeGateDecision = {
  action: ScopeGateAction;
  reasons: RuleGateMismatch[];
};

type RuleGateDebugCheck = {
  kind: "control" | "candidate";
  id: string;
  allowed: boolean;
  scope: FileScope;
  mismatches: RuleGateMismatch[];
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
  "missing_webhook_config_integrity",
  "webhook_code_execution",
  "jwt_validation_bypass",
  "weak_jwt_secret",
  "weak_token_generation",
  "idor",
  "org_id_trust",
  "unsafe_query_builder",
  "anon_key_bearer",
  "missing_bearer_token",
  "frontend_direct_db_write",
  "sensitive_logging",
  "command_output_logging",
  "unbounded_query",
  "missing_timeout",
  "frontend_only_authorization",
  "frontend_login_rate_limit",
  "missing_rate_limiting",
  "missing_lockout",
  "missing_audit_logging",
  "missing_upload_size_limit",
  "frontend_secret_exposure",
  "missing_least_privilege"
]);

const CANDIDATE_PROMOTION_SUMMARY_THRESHOLD = 0.45;

const CANDIDATE_SEVERITY: Record<string, Severity> = {
  sql_injection: "high",
  command_injection: "high",
  dangerous_html_render: "high",
  permissive_cors: "medium",
  debug_auth_leak: "medium",
  missing_webhook_signature: "high",
  missing_webhook_config_integrity: "medium",
  webhook_code_execution: "high",
  jwt_validation_bypass: "high",
  weak_jwt_secret: "high",
  weak_token_generation: "medium",
  idor: "high",
  org_id_trust: "high",
  unsafe_query_builder: "high",
  anon_key_bearer: "medium",
  missing_bearer_token: "high",
  frontend_direct_db_write: "medium",
  sensitive_logging: "medium",
  command_output_logging: "medium",
  unbounded_query: "medium",
  missing_timeout: "medium",
  frontend_only_authorization: "medium",
  frontend_login_rate_limit: "medium",
  missing_rate_limiting: "medium",
  missing_lockout: "medium",
  missing_audit_logging: "medium",
  missing_upload_size_limit: "medium",
  frontend_secret_exposure: "high",
  missing_least_privilege: "medium"
};

const CANDIDATE_CATEGORY: Record<string, string> = {
  sql_injection: "injection",
  command_injection: "injection",
  dangerous_html_render: "injection",
  permissive_cors: "configuration",
  debug_auth_leak: "authentication",
  missing_webhook_signature: "authentication",
  missing_webhook_config_integrity: "configuration",
  webhook_code_execution: "authentication",
  jwt_validation_bypass: "authentication",
  weak_jwt_secret: "authentication",
  weak_token_generation: "authentication",
  idor: "access_control",
  org_id_trust: "access_control",
  unsafe_query_builder: "injection",
  anon_key_bearer: "authentication",
  missing_bearer_token: "authentication",
  frontend_direct_db_write: "access_control",
  sensitive_logging: "secrets",
  command_output_logging: "secrets",
  unbounded_query: "configuration",
  missing_timeout: "configuration",
  frontend_only_authorization: "access_control",
  frontend_login_rate_limit: "authentication",
  missing_rate_limiting: "configuration",
  missing_lockout: "authentication",
  missing_audit_logging: "configuration",
  missing_upload_size_limit: "configuration",
  frontend_secret_exposure: "secrets",
  missing_least_privilege: "configuration"
};

export async function scanRepository(input: RepositoryScanInput): Promise<RepositoryScanFinding[]> {
  if (input.files.length === 0) {
    return [];
  }

  const outputSchema = buildRepositoryScanOutputSchema();
  const systemContext = buildRepositoryContextPrompt([input.repository]);
  const insights = buildFileInsights(input.files);
  const existingFindings = pickExistingFindings(
    input.existingFindings,
    DEFAULT_MAX_EXISTING_FINDINGS_PER_REPO
  );

  const rulePrompts = new Map<string, string>();
  for (const rule of REPOSITORY_SCAN_RULES) {
    const systemPrompt = buildRepositoryRuleSystemPrompt(rule);
    const combinedSystemPrompt = [systemPrompt, systemContext].filter(Boolean).join("\n\n");
    rulePrompts.set(rule.id, combinedSystemPrompt);
  }

  const tasks: RuleScanTask[] = [];
  for (const file of input.files) {
    const fileInsight = insights.fileInsights.get(file.path);
    const fileContext = resolveFileContext(file, fileInsight);
    for (const rule of REPOSITORY_SCAN_RULES) {
      if (!ruleAppliesToFile(rule, fileContext)) {
        if (input.debug) {
          const gateChecks = collectRuleGateDebugChecks(
            rule,
            fileContext.scope,
            fileContext.scopeEvidence
          );
          const blockedChecks = gateChecks.filter((check) => !check.allowed);
          const mismatchSet = new Set<RuleGateMismatch>();
          for (const check of blockedChecks) {
            for (const mismatch of check.mismatches) {
              mismatchSet.add(mismatch);
            }
          }
          const mismatches = Array.from(mismatchSet);
          const hasNonScopeMismatch = mismatches.some((mismatch) => mismatch !== "scope");
          if (blockedChecks.length > 0 && hasNonScopeMismatch) {
            logDebug(input.debug, {
              event: "rule_pass_gate_mismatch",
              rule: {
                id: rule.id,
                title: rule.title,
                category: rule.category,
                requiredControls: rule.requiredControls ?? [],
                candidateTypes: rule.candidateTypes ?? []
              },
              file: {
                path: file.path,
                chunkIndex: file.chunkIndex,
                startLine: file.startLine,
                endLine: file.endLine,
                overlapGroupId: file.overlapGroupId ?? null,
                truncated: file.truncated ?? false
              },
              scope: fileContext.scope ?? null,
              scopeEvidence: fileContext.scopeEvidence ?? null,
              mismatches,
              checks: blockedChecks,
              roles: fileContext.roles
            });
          }
        }
        continue;
      }
      const systemPrompt = rulePrompts.get(rule.id);
      if (!systemPrompt) {
        continue;
      }
      const matchedControls = filterControlsForRule(rule, fileContext);
      const matchedCandidates = filterCandidateFindingsForRule(rule, fileContext).map(
        (candidate) => candidate.type
      );
      tasks.push({
        rule,
        file,
        fileContext,
        systemPrompt,
        roleSummary: insights.roleSummary,
        existingFindings
      });
      if (input.debug) {
        logDebug(input.debug, {
          event: "rule_pass_task",
          taskIndex: tasks.length - 1,
          rule: {
            id: rule.id,
            title: rule.title,
            category: rule.category,
            requiredControls: rule.requiredControls ?? [],
            candidateTypes: rule.candidateTypes ?? []
          },
          file: {
            path: file.path,
            chunkIndex: file.chunkIndex,
            startLine: file.startLine,
            endLine: file.endLine,
            overlapGroupId: file.overlapGroupId ?? null,
            truncated: file.truncated ?? false
          },
          matchedControls,
          matchedCandidateTypes: matchedCandidates,
          roles: fileContext.roles
        });
      }
    }
  }

  const mapConcurrency = normalizeMapConcurrency(input.mapConcurrency);
  const results = await runWithConcurrency(tasks, mapConcurrency, async (task) => {
    const { rule, file, fileContext, roleSummary, existingFindings: existing } = task;
    const ruleRequiredControls = filterControlsForRule(rule, fileContext);
    const ruleCandidateFindings = filterCandidateFindingsForRule(rule, fileContext);

    const filePayload = {
      path: file.path,
      startLine: file.startLine,
      endLine: file.endLine,
      chunkIndex: file.chunkIndex,
      truncated: file.truncated ?? false,
      content: file.content,
      roles: fileContext.roles.length ? fileContext.roles : undefined,
      requiredControls: ruleRequiredControls.length ? ruleRequiredControls : undefined,
      scope: fileContext.scope ?? undefined,
      scopeEvidence: fileContext.scopeEvidence ?? undefined
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
          candidateFindings: ruleCandidateFindings.length ? ruleCandidateFindings : undefined,
          files: [filePayload]
        }
      ],
      focus: `Rule scan: ${rule.id} (${rule.title})`
    };

    const response = await runChatCompletion(input.config, [
      { role: "system", content: task.systemPrompt },
      { role: "user", content: JSON.stringify(payload, null, 2) }
    ]);

    try {
      const parsed = parseFindings(response, input.repository, {
        requireFilepath: true,
        defaultLocation: {
          filepath: file.path,
          startLine: file.startLine,
          endLine: file.endLine,
          chunkIndex: file.chunkIndex
        }
      });
      const scoped = enforceRuleFindings(parsed, rule.id);
      const gateDecision = evaluateRuleScopeGateDecision(
        rule,
        fileContext.scope,
        fileContext.scopeEvidence
      );
      const gated = applyScopeGateToFindings(scoped, gateDecision);
      const overlapGroupId = file.overlapGroupId ?? null;
      if (overlapGroupId) {
        return gated.map((finding) => ({
          ...finding,
          details: { ...toRecord(finding.details), overlapGroupId }
        }));
      }
      return gated;
    } catch (err) {
      const savedPath = await writeLlmDebugArtifact(
        input.config,
        `llm-map-${rule.id}`,
        response
      );
      const message = err instanceof Error ? err.message : String(err);
      logDebug(input.debug, {
        event: "llm_parse_error",
        ruleId: rule.id,
        file: {
          path: file.path,
          chunkIndex: file.chunkIndex,
          startLine: file.startLine,
          endLine: file.endLine,
        },
        message,
        savedPath,
      });
      return [];
    }
  });

  const llmFindings = results.flatMap((result) => result);
  const promoted = promoteCandidateFindings({
    repository: input.repository,
    insights,
    llmFindings,
    existingFindings
  });
  const reduceDebug = input.debug ? { stage: "llm_rule_reduce", log: input.debug.log } : undefined;
  const reduced = reduceRepositoryFindings([...llmFindings, ...promoted], reduceDebug);
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
    const parsed = parseFindings(response, input.repository, { requireFilepath: false });
    return applyCompositeScopeGates(parsed, input.files);
  } catch (err) {
    const savedPath = await writeLlmDebugArtifact(
      input.config,
      "llm-composite",
      response
    );
    const message = err instanceof Error ? err.message : String(err);
    logDebug(input.debug, {
      event: "llm_composite_parse_error",
      message,
      savedPath,
    });
    return [];
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

function resolveFileContext(
  file: RepositoryFileSample,
  fileInsight: FileInsight | undefined
): ResolvedFileContext {
  const fallbackAssignments = fileInsight ? null : deriveFileRoleAssignments([file]);
  const fallbackAssignment = fallbackAssignments?.[0];
  const fallbackScopeAssignments = fileInsight ? null : deriveFileScopeAssignments([file]);
  const fallbackScope = fallbackScopeAssignments?.[0];
  const roles = fileInsight?.roles ?? fallbackAssignment?.roles ?? [];
  const requiredControls =
    fileInsight?.requiredControls ??
    filterRequiredControls(
      fallbackAssignment?.requiredControls ?? [],
      fallbackScope?.scope,
      fallbackScope?.evidence,
      roles
    );
  const candidateFindings =
    fileInsight?.candidateFindings ??
    (fallbackAssignments
      ? buildCandidateFindings([file], fallbackAssignments, fallbackScopeAssignments ?? undefined)
      : []);

  return {
    roles,
    requiredControls,
    candidateFindings,
    scope: fileInsight?.scope ?? fallbackScope?.scope,
    scopeEvidence: fileInsight?.scopeEvidence ?? fallbackScope?.evidence
  };
}

function ruleAppliesToFile(rule: RuleScanDefinition, fileContext: ResolvedFileContext): boolean {
  const requiredControls = rule.requiredControls ?? [];
  const candidateTypes = rule.candidateTypes ?? [];
  const matchesRequired =
    requiredControls.length > 0 &&
    requiredControls.some((control) => fileContext.requiredControls.includes(control));
  const matchesCandidate =
    candidateTypes.length > 0 &&
    fileContext.candidateFindings.some((candidate) => candidateTypes.includes(candidate.type));
  return matchesRequired || matchesCandidate;
}

function collectRuleGateDebugChecks(
  rule: RuleScanDefinition,
  scope: FileScope | undefined,
  evidence: FileScopeEvidence | undefined
): RuleGateDebugCheck[] {
  const checks: RuleGateDebugCheck[] = [];
  for (const control of rule.requiredControls ?? []) {
    const check = evaluateControlGate(control, scope, evidence);
    if (check) {
      checks.push({ kind: "control", id: control, ...check });
    }
  }
  for (const candidateType of rule.candidateTypes ?? []) {
    const check = evaluateCandidateGate(candidateType, scope, evidence);
    if (check) {
      checks.push({ kind: "candidate", id: candidateType, ...check });
    }
  }
  return checks;
}

function filterControlsForRule(
  rule: RuleScanDefinition,
  fileContext: ResolvedFileContext
): string[] {
  const requiredControls = rule.requiredControls ?? [];
  if (requiredControls.length === 0) {
    return [];
  }
  return fileContext.requiredControls.filter((control) => requiredControls.includes(control));
}

function filterCandidateFindingsForRule(
  rule: RuleScanDefinition,
  fileContext: ResolvedFileContext
): CandidateFinding[] {
  const candidateTypes = rule.candidateTypes ?? [];
  if (candidateTypes.length === 0) {
    return [];
  }
  return fileContext.candidateFindings.filter((candidate) =>
    candidateTypes.includes(candidate.type)
  );
}

function enforceRuleFindings(
  findings: RepositoryScanFinding[],
  ruleId: string
): RepositoryScanFinding[] {
  const expectedType = extractFindingIdentityType({ type: ruleId });
  return findings.flatMap((finding) => {
    const details = toRecord(finding.details);
    const actualType = extractFindingIdentityType({ type: finding.type ?? null, details });
    if (actualType && expectedType && actualType !== expectedType) {
      return [];
    }
    return [
      {
        ...finding,
        type: finding.type ?? ruleId,
        details: { ...details, ruleId: details.ruleId ?? ruleId }
      }
    ];
  });
}

function evaluateRuleScopeGateDecision(
  rule: RuleScanDefinition,
  scope: FileScope | undefined,
  evidence: FileScopeEvidence | undefined
): ScopeGateDecision {
  const gateChecks: RuleGateCheck[] = [];

  for (const control of rule.requiredControls ?? []) {
    const check = evaluateControlGate(control, scope, evidence);
    if (check) {
      gateChecks.push(check);
    }
  }

  for (const candidateType of rule.candidateTypes ?? []) {
    const check = evaluateCandidateGate(candidateType, scope, evidence);
    if (check) {
      gateChecks.push(check);
    }
  }

  if (gateChecks.length === 0 || gateChecks.some((check) => check.allowed)) {
    return { action: "allow", reasons: [] };
  }

  const mismatches = new Set<RuleGateMismatch>();
  for (const check of gateChecks) {
    for (const mismatch of check.mismatches) {
      mismatches.add(mismatch);
    }
  }
  if (mismatches.size === 0) {
    return { action: "allow", reasons: [] };
  }

  const scopeValue = scope ?? "unknown";
  const scopeUnknown = scopeValue === "unknown";
  const hasScopeMismatch = mismatches.has("scope");
  const hasEndpointMismatch = mismatches.has("endpoint") || mismatches.has("shared");
  const reasons = Array.from(mismatches);

  if (hasEndpointMismatch || (hasScopeMismatch && !scopeUnknown)) {
    return { action: "suppress", reasons };
  }
  return { action: "downgrade", reasons };
}

function applyScopeGateToFinding(
  finding: RepositoryScanFinding,
  decision: ScopeGateDecision
): RepositoryScanFinding | null {
  if (decision.action === "allow") {
    return finding;
  }
  if (decision.action === "suppress") {
    return null;
  }

  const details = { ...toRecord(finding.details) };
  details.lowConfidence = true;
  details.scopeGate = {
    action: "downgraded",
    reasons: decision.reasons
  };

  return {
    ...finding,
    severity: "info",
    details
  };
}

function applyScopeGateToFindings(
  findings: RepositoryScanFinding[],
  decision: ScopeGateDecision
): RepositoryScanFinding[] {
  if (decision.action === "allow") {
    return findings;
  }
  const gated: RepositoryScanFinding[] = [];
  for (const finding of findings) {
    const next = applyScopeGateToFinding(finding, decision);
    if (next) {
      gated.push(next);
    }
  }
  return gated;
}

function extractRuleIdForGate(finding: RepositoryScanFinding): string {
  const details = toRecord(finding.details);
  const candidates = [
    finding.type,
    details.ruleId,
    details.rule_id,
    details.ruleID,
    details.findingType,
    details.finding_type,
    details.type
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

function applyCompositeScopeGates(
  findings: RepositoryScanFinding[],
  files: RepositoryFileSample[]
): RepositoryScanFinding[] {
  if (findings.length === 0 || files.length === 0) {
    return findings;
  }

  const scopeAssignments = deriveFileScopeAssignments(files);
  if (scopeAssignments.length === 0) {
    return findings;
  }

  const scopeByPath = new Map(
    scopeAssignments.map((assignment) => [normalizePath(assignment.path), assignment])
  );
  const rulesById = new Map(REPOSITORY_SCAN_RULES.map((rule) => [rule.id, rule]));
  const gated: RepositoryScanFinding[] = [];

  for (const finding of findings) {
    const ruleId = extractRuleIdForGate(finding);
    const rule = ruleId ? rulesById.get(ruleId) : null;
    if (!rule) {
      gated.push(finding);
      continue;
    }

    const filepath = extractFindingPath(finding);
    if (!filepath) {
      gated.push(finding);
      continue;
    }

    const assignment = scopeByPath.get(normalizePath(filepath));
    if (!assignment) {
      gated.push(finding);
      continue;
    }

    const decision = evaluateRuleScopeGateDecision(rule, assignment.scope, assignment.evidence);
    const next = applyScopeGateToFinding(finding, decision);
    if (next) {
      gated.push(next);
    }
  }

  return gated;
}

function buildFileInsights(files: RepositoryFileSample[]): RepoInsights {
  const fileInsights = new Map<string, FileInsight>();
  if (!files || files.length === 0) {
    return { fileInsights, roleSummary: {}, candidates: [] };
  }

  const assignments = deriveFileRoleAssignments(files);
  const scopeAssignments = deriveFileScopeAssignments(files);
  const scopeByPath = new Map(
    scopeAssignments.map((assignment) => [normalizePath(assignment.path), assignment])
  );
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
    const scopeAssignment = scopeByPath.get(path);
    const scopedControls = filterRequiredControls(
      requiredControls,
      scopeAssignment?.scope,
      scopeAssignment?.evidence,
      roles
    );
    unionAssignments.push({ path, roles, requiredControls: scopedControls });
    fileInsights.set(path, {
      roles,
      requiredControls: scopedControls,
      candidateFindings: [],
      scope: scopeAssignment?.scope,
      scopeEvidence: scopeAssignment?.evidence
    });
  }

  const candidates = buildCandidateFindings(files, unionAssignments, scopeAssignments);
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
    const scopeEvidence = candidate.filepath
      ? insights.fileInsights.get(candidate.filepath)?.scopeEvidence
      : undefined;
    const entryPoint = deriveCandidateEntryPoint(candidate, scopeEvidence);
    const finding = buildFindingFromCandidate(candidate, repository, entryPoint);
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
  if (typeKey === "missing_lockout") {
    return shouldPromoteLockoutCandidate(candidate);
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
  return /(token|login|signin|signup|auth|password|reset|invite|delete|admin|create|project|write|update|insert|upsert|revoke|issue|generate|api[_-]?token|access[_-]?token|refresh[_-]?token)/i.test(text);
}

function shouldPromoteLockoutCandidate(candidate: CandidateFinding): boolean {
  const roles = candidate.relatedFileRoles ?? [];
  if (roles.includes("AUTH_ENDPOINT")) {
    return true;
  }
  const filepath =
    typeof candidate.filepath === "string" ? candidate.filepath.toLowerCase() : "";
  const text = `${candidate.summary ?? ""} ${filepath} ${collectEvidenceText(candidate)}`.toLowerCase();
  return /(login|signin|signup|auth|password|credential|token|attempt|brute|lockout)/i.test(text);
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

function stripExtension(value: string): string {
  if (!value) return "";
  const index = value.lastIndexOf(".");
  if (index <= 0) return value;
  return value.slice(0, index);
}

function deriveServerActionSymbol(filepath: string): string {
  const normalized = normalizePath(filepath);
  if (!normalized) return "";
  const match = normalized.match(/(?:^|\/)app\/(?:[^/]+\/)*actions\/(.+)$/i);
  if (match?.[1]) {
    return stripExtension(match[1]);
  }
  const base = normalized.split("/").pop() ?? "";
  return stripExtension(base);
}

function deriveCandidateEntryPoint(
  candidate: CandidateFinding,
  scopeEvidence?: FileScopeEvidence
): { entryPoint?: string; primarySymbol?: string } {
  const hints = scopeEvidence?.entryPointHints ?? [];
  const idHint = hints.find((hint) => hint.toLowerCase().startsWith("id:"));
  if (idHint) {
    const identifier = idHint.slice("id:".length).trim();
    if (identifier) {
      return { entryPoint: identifier, primarySymbol: identifier };
    }
  }
  const isServerAction = Boolean(scopeEvidence?.isServerAction) ||
    hints.some((hint) => hint.toLowerCase() === "server.action");
  if (isServerAction) {
    const symbol = deriveServerActionSymbol(candidate.filepath ?? "");
    if (symbol) {
      return { entryPoint: `server.action:${symbol}`, primarySymbol: symbol };
    }
    return { entryPoint: "server.action" };
  }
  return {};
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
  const candidateTypeToken = normalizeMergeIdentityToken(candidateType);
  const candidateTokens = summaryTokenSet(candidate.summary ?? "");
  const candidateText = `${candidate.summary ?? ""} ${collectEvidenceText(candidate)}`.toLowerCase();

  for (const finding of llmFindings) {
    const filepath = extractFindingPath(finding);
    if (!filepath || filepath !== candidatePath) {
      continue;
    }
    const findingType = normalizeMergeIdentityToken(normalizeFindingTypeKey(finding));
    const findingRuleId = extractRuleIdForMerge(finding);
    const findingCandidateType = extractCandidateTypeForMerge(finding);
    if (
      candidateTypeToken &&
      (candidateTypeToken === findingType ||
        candidateTypeToken === findingRuleId ||
        candidateTypeToken === findingCandidateType)
    ) {
      return true;
    }
    const entryPoint = extractEntryPointForMerge(finding);
    const hasAlignment =
      Boolean(candidateTypeToken &&
        (candidateTypeToken === findingType ||
          candidateTypeToken === findingRuleId ||
          candidateTypeToken === findingCandidateType)) ||
      Boolean(entryPoint && candidateText.includes(entryPoint));
    if (!hasAlignment) {
      continue;
    }
    if (isSummarySimilar(candidateTokens, finding.summary ?? "", candidateTypeToken)) {
      return true;
    }
  }

  for (const finding of existingFindings ?? []) {
    const filepath = extractExistingFindingPath(finding);
    if (!filepath || filepath !== candidatePath) {
      continue;
    }
    const details = toRecord(finding.details);
    const findingType = normalizeMergeIdentityToken(normalizeFindingTypeKeyFromValues(finding.type, details));
    const findingRuleId = normalizeMergeIdentityToken(
      details.ruleId ?? details.rule_id ?? details.ruleID ?? details.findingType ?? details.finding_type ?? ""
    );
    const findingCandidateType = normalizeMergeIdentityToken(
      details.candidateType ?? details.candidate_type ?? ""
    );
    if (
      candidateTypeToken &&
      (candidateTypeToken === findingType ||
        candidateTypeToken === findingRuleId ||
        candidateTypeToken === findingCandidateType)
    ) {
      return true;
    }
    const entryPoint = extractEntryPointFromDetails(details);
    const hasAlignment =
      Boolean(candidateTypeToken &&
        (candidateTypeToken === findingType ||
          candidateTypeToken === findingRuleId ||
          candidateTypeToken === findingCandidateType)) ||
      Boolean(entryPoint && candidateText.includes(entryPoint));
    if (!hasAlignment) {
      continue;
    }
    if (isSummarySimilar(candidateTokens, finding.summary ?? "", candidateTypeToken)) {
      return true;
    }
  }

  return false;
}

function buildFindingFromCandidate(
  candidate: CandidateFinding,
  repository: RepositoryDescriptor,
  entryPoint?: { entryPoint?: string; primarySymbol?: string }
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
  if (typeof candidate.recommendation === "string" && candidate.recommendation.trim()) {
    details.recommendation = candidate.recommendation.trim();
  }
  if (entryPoint?.entryPoint) {
    details.entryPoint = entryPoint.entryPoint;
  }
  if (entryPoint?.primarySymbol) {
    details.primarySymbol = entryPoint.primarySymbol;
  }
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

function normalizeRepoPaths(repoPaths?: string[] | null): string[] {
  if (!repoPaths || repoPaths.length === 0) {
    return [];
  }
  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const repoPath of repoPaths) {
    if (typeof repoPath !== "string") continue;
    const cleaned = normalizePath(repoPath);
    if (!cleaned || seen.has(cleaned)) {
      continue;
    }
    seen.add(cleaned);
    normalized.push(cleaned);
  }
  return normalized;
}

function selectRepoPathForFinding(
  repoPaths: string[],
  filepath: string,
  rawRepoPath: unknown
): string | null {
  if (repoPaths.length === 0) {
    return null;
  }
  if (repoPaths.length === 1) {
    return repoPaths[0];
  }

  if (typeof rawRepoPath === "string") {
    const normalized = normalizePath(rawRepoPath);
    if (normalized && repoPaths.includes(normalized)) {
      return normalized;
    }
  }

  if (filepath) {
    const match = selectRepoPathForFile(filepath, repoPaths);
    return match || null;
  }

  return null;
}

function sanitizeFindingRepoPath(
  location: Record<string, unknown> | null,
  details: Record<string, unknown>,
  repoPaths?: string[] | null
): Record<string, unknown> | null {
  const normalizedRepoPaths = normalizeRepoPaths(repoPaths);
  const rawRepoPath =
    location?.repoPath ??
    (location as any)?.repo_path ??
    details.repoPath ??
    details.repo_path;
  const filepath = typeof location?.filepath === "string" ? location.filepath : "";
  const selectedRepoPath = selectRepoPathForFinding(
    normalizedRepoPaths,
    filepath,
    rawRepoPath
  );

  if (selectedRepoPath) {
    if (location) {
      location.repoPath = selectedRepoPath;
      delete (location as any).repo_path;
    }
    details.repoPath = selectedRepoPath;
    delete (details as any).repo_path;
  } else {
    if (location) {
      delete (location as any).repoPath;
      delete (location as any).repo_path;
    }
    delete (details as any).repoPath;
    delete (details as any).repo_path;
  }

  return location;
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
    const sanitizedLocation = sanitizeFindingRepoPath(
      normalizedLocation,
      details,
      repository.repoPaths
    );
    const type = normalizeFindingType(item?.type ?? details.type ?? details.category);
    const evidence = mergeStringArrays(
      normalizeEvidence(details.evidence),
      normalizeEvidence(item?.evidence)
    );

    // Ensure confidence is always present for LLM findings (used for UI/triage).
    if (typeof details.confidence !== "string" || !details.confidence.trim()) {
      details.confidence = evidence.length > 0 ? "medium" : "low";
    }

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
      location: sanitizedLocation
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
  const cleaned = stripJsonComments(raw);
  try {
    return JSON.parse(cleaned);
  } catch (err) {
    const recovered = recoverFindingsArray(cleaned);
    if (recovered) {
      return recovered;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`LLM returned invalid JSON: ${message}`);
  }
}

function recoverFindingsArray(raw: string): any[] | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }

  // Recover complete objects from a truncated findings array.
  let inString = false;
  let escape = false;
  let arrayStarted = false;
  let objectDepth = 0;
  let objectStart = -1;
  const recovered: any[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
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
      continue;
    }
    if (inString) {
      continue;
    }

    if (!arrayStarted) {
      if (char === "[") {
        arrayStarted = true;
      }
      continue;
    }

    if (char === "{") {
      if (objectDepth === 0) {
        objectStart = i;
      }
      objectDepth += 1;
      continue;
    }

    if (char === "}") {
      if (objectDepth > 0) {
        objectDepth -= 1;
        if (objectDepth === 0 && objectStart !== -1) {
          const candidate = text.slice(objectStart, i + 1).trim();
          if (candidate) {
            try {
              recovered.push(JSON.parse(candidate));
            } catch {
              // Ignore malformed objects and keep earlier recovered findings.
            }
          }
          objectStart = -1;
        }
      }
      continue;
    }

    if (char === "]" && objectDepth === 0) {
      break;
    }
  }

  return recovered.length ? recovered : null;
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
  // Always prefer the sampled file path; ignore any LLM-provided filepath.
  merged.filepath = normalizePath(fallback.filepath);
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

function logDebug(debug: DedupeDebug | undefined, event: Record<string, unknown>): void {
  if (!debug) return;
  debug.log({ stage: debug.stage, ...event });
}

function normalizeTypeToken(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeMergeIdentityToken(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  return normalizeTypeToken(trimmed);
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

function extractRuleIdForMerge(finding: RepositoryScanFinding): string {
  const details = toRecord(finding.details);
  const ruleId =
    details.ruleId ??
    details.rule_id ??
    details.ruleID ??
    details.findingType ??
    details.finding_type ??
    null;
  return normalizeMergeIdentityToken(ruleId);
}

function extractCandidateTypeForMerge(finding: RepositoryScanFinding): string {
  const details = toRecord(finding.details);
  const candidateType = details.candidateType ?? details.candidate_type ?? null;
  return normalizeMergeIdentityToken(candidateType);
}

function extractEntryPointForMerge(finding: RepositoryScanFinding): string {
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
    return normalizeEntryPointIdentity(trimmed);
  }
  return "";
}

function extractEntryPointFromDetails(details: Record<string, unknown>): string {
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
    return normalizeEntryPointIdentity(trimmed);
  }
  return "";
}

function shouldMergeRepositoryFindings(
  left: RepositoryScanFinding,
  right: RepositoryScanFinding
): { merge: boolean; reason?: string } {
  const leftRuleId = extractRuleIdForMerge(left);
  const rightRuleId = extractRuleIdForMerge(right);
  if (leftRuleId && rightRuleId && leftRuleId !== rightRuleId) {
    return { merge: false, reason: "rule_id_mismatch" };
  }
  const leftCandidateType = extractCandidateTypeForMerge(left);
  const rightCandidateType = extractCandidateTypeForMerge(right);
  if (leftCandidateType && rightCandidateType && leftCandidateType !== rightCandidateType) {
    return { merge: false, reason: "candidate_type_mismatch" };
  }
  const leftIdentity = leftRuleId || leftCandidateType;
  const rightIdentity = rightRuleId || rightCandidateType;
  if (leftIdentity && rightIdentity && leftIdentity !== rightIdentity) {
    return { merge: false, reason: "identity_mismatch" };
  }
  const leftEntryPoint = extractEntryPointForMerge(left);
  const rightEntryPoint = extractEntryPointForMerge(right);
  if (leftEntryPoint && rightEntryPoint && leftEntryPoint !== rightEntryPoint) {
    return { merge: false, reason: "entry_point_mismatch" };
  }
  return { merge: true };
}

function buildRepositoryDebugFinding(finding: RepositoryScanFinding): Record<string, unknown> {
  const details = toRecord(finding.details);
  const location = toRecord(finding.location);
  const filepathRaw = location.filepath ?? location.filePath ?? location.path ?? location.file;
  const filepath = typeof filepathRaw === "string" ? filepathRaw : "";
  const startLine = normalizeLineNumber(
    location.startLine ?? location.start_line ?? location.line ?? location.start
  );
  const endLine = normalizeLineNumber(
    location.endLine ?? location.end_line ?? location.lineEnd ?? location.end
  );
  const chunkIndex = normalizeChunkIndex(location.chunkIndex ?? (location as any).chunk_index);
  const categoryRaw =
    details.category ?? details.findingCategory ?? details.finding_category ?? null;
  const category = typeof categoryRaw === "string" ? categoryRaw.trim() : null;
  const sourceRaw = details.source ?? null;
  const source = typeof sourceRaw === "string" ? sourceRaw.trim() : null;
  const identityType = extractFindingIdentityType({
    summary: finding.summary,
    type: finding.type ?? null,
    category,
    source,
    location: finding.location ?? null,
    details: finding.details ?? null
  });
  const ruleId =
    details.ruleId ??
    details.rule_id ??
    details.ruleID ??
    details.findingType ??
    details.finding_type ??
    null;
  const candidateType = details.candidateType ?? details.candidate_type ?? null;
  const entryPoint = extractEntryPointForMerge(finding);

  return {
    summary: finding.summary,
    severity: finding.severity,
    type: finding.type ?? null,
    identityType: identityType || null,
    ruleId: typeof ruleId === "string" ? ruleId.trim() : null,
    candidateType: typeof candidateType === "string" ? candidateType.trim() : null,
    entryPoint: entryPoint || null,
    dedupeKey: buildFindingIdentityKey(finding) || null,
    repositoryFullName: finding.repositoryFullName ?? null,
    location: {
      filepath: filepath || null,
      startLine,
      endLine,
      chunkIndex
    }
  };
}

export function reduceRepositoryFindings(
  findings: RepositoryScanFinding[],
  debug?: DedupeDebug
): RepositoryScanFinding[] {
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
    const decision = shouldMergeRepositoryFindings(existing, finding);
    if (!decision.merge) {
      if (debug) {
        logDebug(debug, {
          event: "merge_reduce_skip",
          fingerprint,
          reason: decision.reason ?? "mismatch",
          left: buildRepositoryDebugFinding(existing),
          right: buildRepositoryDebugFinding(finding)
        });
      }
      passthrough.push(finding);
      continue;
    }
    const merged = mergeRepositoryFindings(existing, finding);
    if (debug) {
      logDebug(debug, {
        event: "merge_reduce",
        fingerprint,
        left: buildRepositoryDebugFinding(existing),
        right: buildRepositoryDebugFinding(finding),
        merged: buildRepositoryDebugFinding(merged)
      });
    }
    deduped.set(fingerprint, merged);
  }

  const combined = [...deduped.values(), ...passthrough];
  combined.sort(compareFindingsBySeverity);
  return combined;
}

function repositoryFindingFingerprint(finding: RepositoryScanFinding): string | null {
  const key = buildFindingIdentityKey(finding);
  return key || null;
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
  return extractFindingIdentityType(finding);
}

function normalizeFindingTypeKeyFromValues(typeValue: unknown, details: Record<string, unknown>): string {
  return extractFindingIdentityType({
    type: typeof typeValue === "string" ? typeValue : null,
    details
  });
}

const SUMMARY_GENERIC_TOKENS = new Set([
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
  "should",
  "must",
  "needs",
  "need",
  "required",
  "require",
  "requires",
  "ensure",
  "ensures",
  "ensured",
  "using",
  "use",
  "uses",
  "used",
  "allow",
  "allows",
  "allowed",
  "endpoint",
  "endpoints",
  "route",
  "routes",
  "handler",
  "handlers",
  "api",
  "apis",
  "server",
  "servers",
  "client",
  "clients",
  "backend",
  "frontend",
  "request",
  "requests",
  "user",
  "users",
  "data",
  "input",
  "function",
  "functions",
  "file",
  "files",
  "code",
  "check",
  "checks",
  "validation",
  "validate",
  "validated",
  "enforce",
  "enforced",
  "enforcement"
]);

const SUMMARY_TYPE_TOKENS_TO_IGNORE = new Set([
  "missing",
  "weak",
  "frontend",
  "backend",
  "only",
  "no"
]);

function summaryTokenSet(value: string): Set<string> {
  if (!value) return new Set<string>();
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return new Set<string>();
  const tokens = normalized.split(" ").filter(Boolean);
  const filtered = tokens.filter((token) => !SUMMARY_GENERIC_TOKENS.has(token));
  return new Set(filtered.length > 0 ? filtered : tokens);
}

function typeTokenSet(value: string): Set<string> {
  if (!value) return new Set<string>();
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return new Set<string>();
  const tokens = normalized
    .split(" ")
    .filter(Boolean)
    .filter((token) => !SUMMARY_TYPE_TOKENS_TO_IGNORE.has(token));
  return new Set(tokens);
}

function isSummarySimilar(
  candidateTokens: Set<string>,
  summary: string,
  candidateType?: string
): boolean {
  const summaryTokens = summaryTokenSet(summary);
  if (candidateTokens.size === 0 || summaryTokens.size === 0) {
    return false;
  }
  let overlap = 0;
  for (const token of candidateTokens) {
    if (summaryTokens.has(token)) {
      overlap += 1;
      break;
    }
  }
  if (overlap === 0) {
    return false;
  }
  const score = jaccard(candidateTokens, summaryTokens);
  if (score < CANDIDATE_PROMOTION_SUMMARY_THRESHOLD) {
    return false;
  }
  if (candidateType) {
    const typeTokens = typeTokenSet(candidateType);
    if (typeTokens.size > 0) {
      let typeOverlap = 0;
      for (const token of typeTokens) {
        if (summaryTokens.has(token)) {
          typeOverlap += 1;
          break;
        }
      }
      if (typeOverlap === 0 && score < CANDIDATE_PROMOTION_SUMMARY_THRESHOLD + 0.15) {
        return false;
      }
    }
  }
  return true;
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
      return str === "info" || str === "informational" || str === "note" ? "info" : "low";
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
  return buildFindingIdentityKey(finding) || "";
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
