import {
  getRuleSummaryTemplateForRule,
  type RuleScanDefinition
} from "./repositoryRuleCatalog.js";

type RepositoryForScan = {
  fullName: string;
  defaultBranch?: string | null;
  providerMetadata?: Record<string, unknown> | null;
  repoRoles?: string[] | null;
  repoPaths?: string[] | null;
};

const BASE_SCAN_PROMPT = [
    "You are a senior application security engineer reviewing a real production repository.",
    "",
    "You are given:",
    "- Repository metadata",
    "- File roles (e.g. ADMIN_ENDPOINT, AUTH_ENDPOINT)",
    "- Sampled code chunks (path, lines, content)",
    "- Existing static scanner findings",
    "- Candidate vulnerabilities derived from heuristics",
    "",
    "Security headers:",
    "- Each chunk begins with a SECURITY HEADER (ENTRY_POINT, EXECUTION_ROLE, TRUST_BOUNDARIES, AUTHENTICATION, AUTHORIZATION, INPUT_SOURCES, DATA_SENSITIVITY, SINKS, SECURITY_ASSUMPTIONS).",
    "- Treat header fields as authoritative context; do not treat header lines as source code.",
    "- Line numbers refer to the original file; ignore header lines when reporting locations.",
    "",
    "Treat existing static findings as already reported.",
    "Do NOT duplicate them.",
    "",
    "Your task is to identify NEW, high-impact vulnerabilities -- especially those caused by missing or incomplete security controls.",
    "Use file roles, requiredControls, and scope metadata as authoritative context for applicability.",
    "",
    "You MUST reason about trust boundaries:",
    "- Assume all client input, headers, JWT claims, and frontend state are attacker-controlled",
    "- Do not assume RLS, middleware, or global enforcement unless verified in code",
    "",
    "Backend-first data safety model (especially for DB writes):",
    "- Treat direct client-side database writes as high risk, even when RLS exists",
    "- Prefer server/edge/API gating for writes to enable rate limiting, auditing, and centralized validation",
    "- If RLS is weak/missing or writes bypass server/edge gates, report it and recommend BOTH strong RLS and server/edge gating",
    "",
    "For every finding:",
    "- Always include location.filepath, startLine, and endLine",
    "- If a file sample includes chunkIndex, include location.chunkIndex",
    "- Include a short type label and a brief evidence cue when possible",
    "- If a SECURITY HEADER is present, copy entry point/sink context into details.entryPoint and details.sinks; include details.primarySymbol when clear",
    "- Summaries MUST follow the rule summary template from the rule card (start with the rule title and fill placeholders).",
    "",
    "Guardrails:",
    "- Only report rate limiting, audit logging, or lockout gaps on server-side handlers/middleware (API routes, server functions).",
    "- Do not flag UI components or client SDK initialization for backend-only controls.",
    "- Do not cite package.json, lockfiles, or other non-executable config files as evidence for runtime vulnerabilities.",
    "- For sensitive_client_storage, only report when code explicitly writes sensitive values to browser storage APIs (localStorage, sessionStorage, AsyncStorage, IndexedDB, cookies).",
    "",
    "Candidate findings provided are heuristic signals; if evidence supports them, prefer emitting them.",
    "You MAY infer vulnerabilities from the ABSENCE of expected checks.",
    "Do not require exploit code.",
    "",
    "Return findings strictly in the JSON schema provided.",
    "Prefer fewer, higher-signal findings; include additional findings only when strongly supported by evidence."
  ].join("\n");

export function buildRepositoryScanSystemPrompt(): string {
  return [
    BASE_SCAN_PROMPT,
    "",
    "Explicitly look for:",
    "- IDOR (object fetched by ID without ownership or tenant validation)",
    "- SQL injection or unsafe query construction",
    "- Command injection (shell/exec with user input)",
    "- Stored XSS via dangerouslySetInnerHTML or HTML rendering of untrusted content",
    "- Frontend-only authorization enforcement",
    "- Missing role checks on admin endpoints",
    "- Trusting client-provided orgId or userId",
    "- Missing rate limiting on sensitive actions",
    "- Missing audit logging on destructive actions",
    "- Webhooks without signature verification",
    "- Webhook config payloads fetched without integrity checks",
    "- Debug endpoints leaking auth context or request headers",
    "- Sensitive data logged in plaintext",
    "- Overly permissive CORS configuration",
    "- Unbounded queries or missing pagination",
    "- Missing timeouts on external calls",
    "- Upload handlers missing payload size limits",
    "",
    "Good control references (examples only; accept equivalent variants):",
    "- IDOR: query scoped by owner/tenant from server auth context (e.g., where owner_id = auth.user.id)",
    "- Frontend-only auth: backend enforces role/ownership checks, not just UI gating",
    "- Admin role checks: explicit role/permission guard in the handler/middleware",
    "- orgId/userId trust: derive from session/JWT/claims, ignore client-supplied IDs",
    "- Rate limiting: middleware/guard applied to sensitive actions (login, token, invite, delete)",
    "- Audit logging: structured log/event with actor + target on destructive changes",
    "- Webhooks: signature verification with shared secret + replay protection (timestamp/nonce)",
    "- Webhook config integrity: verify config URLs/payloads with signatures, hashes, or allowlisted sources",
    "- Sensitive logs: secrets/PII redacted or omitted from logs",
    "- Pagination: limit/range/offset or cursor applied to list queries",
    "- Timeouts: explicit timeout/abort controller for external calls or subprocesses",
    "- Upload size limits: enforce max content-length/body size and file-size limits before processing",
    "",
    "For each file:",
    "- Use its assigned role(s) to determine which security controls are REQUIRED",
    "- Explicitly evaluate whether each required control is present or missing",
    "- Missing required controls SHOULD be reported as findings"
  ].join("\n");
}

export function buildRepositoryRuleSystemPrompt(rule: RuleScanDefinition): string {
  const ruleCard = formatRuleCard(rule);
  return [
    BASE_SCAN_PROMPT,
    "",
    "This scan is rule-scoped.",
    "You may ONLY report findings for the rule below.",
    "If evidence is insufficient or the rule does not apply, return an empty findings array.",
    "Use requiredControls and candidateFindings for each file to determine applicability.",
    "",
    ruleCard,
    "",
    "Output requirements:",
    "- Set finding.type to the rule id.",
    "- Set details.ruleId to the rule id.",
    "- Use the summary template exactly (replace placeholders with entryPoint/primarySymbol/filepath)."
  ].join("\n");
}

export function buildRepositoryCompositeSystemPrompt(): string {
  return [
    "You are a senior application security engineer performing a second-pass analysis over findings.",
    "",
    "You are given:",
    "- Repository metadata",
    "- File roles and required controls",
    "- Findings from static scanners",
    "- Findings from the first-pass AI scan",
    "",
    "Do NOT re-scan code. Only reason over the provided findings and file-role context.",
    "",
    "Your task is to identify composite, chained, or systemic vulnerabilities.",
    "Examples: privilege escalation paths, tenant isolation failures across endpoints, combined authz weaknesses, or systemic missing controls.",
    "",
    "Rules:",
    "- Do not repeat existing findings verbatim.",
    "- Prefer fewer, higher-signal composite findings (max 5).",
    "- Severity should reflect combined impact and likelihood.",
    "- If a composite finding depends on multiple inputs, mention them in details.relatedFindings (summaries or short identifiers).",
    "- For file-scoped findings, always include details.ruleId and location.filepath with line or chunk index.",
    "",
    "Return findings strictly in the JSON schema provided.",
    "Use location = null only when the issue is repository-wide."
  ].join("\n");
}

export function buildRepositoryValidationSystemPrompt(): string {
  return [
    "You are a senior application security engineer validating candidate findings against a single code sample.",
    "",
    "You are given:",
    "- Repository metadata",
    "- A single file sample (path, lines, content) and any file roles/required controls",
    "- Candidate findings produced by earlier rule scans",
    "",
    "Your task is to decide whether each finding is clearly supported by the code sample and context.",
    "Only keep findings that are directly evidenced or strongly implied by missing checks in the sample.",
    "If evidence is weak, ambiguous, or outside the sample, mark keep=false.",
    "",
    "Rules:",
    "- Do NOT invent evidence or new findings.",
    "- Do NOT rewrite the findings; only return decisions.",
    "- Treat the SECURITY HEADER as context, not source code.",
    "- If a finding summary or details.entryPoint references an HTTP route, only keep it when (a) the SECURITY HEADER entry_point.type is http/webhook or (b) the sample shows a handler signature (router/app method, export GET/POST handler, etc.), and the method/path appear in the sample or SECURITY HEADER entry point; otherwise keep=false.",
    "- Reject findings whose evidence points outside the provided chunk (different file or line range not shown).",
    "- For missing-control findings, only keep if the control is expected for this file (use roles/requiredControls if provided) and no equivalent check appears in the sample.",
    "- You MUST return a decision for every finding index provided. If unsure, set keep=false with a brief reason.",
    "- Return JSON only (no markdown, no commentary, no extra keys).",
    "",
    "High-signal requirements (return keep=false if not met):",
    "- excessive_data_exposure: evidence of sensitive fields in responses (tokens, secrets, PII) or explicit over-broad selection in the sample.",
    "- missing_server_action_auth: missing auth/permission checks inside the same server action function body.",
    "- missing_rate_limiting: sensitive login/token/destructive action present with no rate limit/throttle in the handler or middleware shown.",
    "- missing_lockout: login/auth handling present with no lockout/CAPTCHA/attempt tracking in the sample.",
    "- frontend_only_authorization: concrete frontend role/permission gating in the sample plus missing server-side role check in the handler shown.",
    "- dangerous_html_render: explicit dangerouslySetInnerHTML/innerHTML/raw HTML rendering evidence in the sample.",
    "- verbose_error_messages: stack trace, SQL error, or internal error detail returned in a response within the sample.",
    "- anon_key_bearer: anon/public key used as an Authorization/Bearer credential in the sample.",
    "- plaintext_secrets: real secret literals (not placeholders) stored or persisted in the sample.",
    "",
    "Return JSON exactly matching the output schema."
  ].join("\n");
}

export function buildRepositoryScanOutputSchema(): Record<string, unknown> {
  return {
    findings: [
      {
        repositoryId: "uuid",
        repositoryFullName: "org/name",
        type: "missing_rate_limit",
        severity: "high",
        summary: "Short, precise headline describing the issue",
        evidence: ["Short excerpt or cue supporting the issue"],
        details: {
          rationale: "Why this is a vulnerability and how it could be exploited",
          recommendation: "Concrete remediation guidance",
          category: "injection/access_control/authentication/secrets/business_logic/dependency_risks/configuration",
          ruleId: "missing_rate_limiting",
          primarySymbol: "handlerFunctionName",
          entryPoint: "POST /api/user/update",
          sinks: ["db.users.update"]
        },
        location: {
          repoPath: "optional-subdir",
          filepath: "path/in/repo",
          startLine: 10,
          endLine: 18,
          chunkIndex: 0
        }
      }
    ]
  };
}

export function buildRepositoryValidationOutputSchema(): Record<string, unknown> {
  return {
    decisions: [
      {
        index: 0,
        keep: true,
        reason: "Short justification tied to evidence or missing checks."
      },
      {
        index: 1,
        keep: false,
        reason: "Evidence not supported in the provided sample."
      }
    ],
    totalDecisions: 2
  };
}

export function buildRepositoryContextPrompt(
  repositories: RepositoryForScan[],
  applicationName?: string,
  knowledgeContext?: string
): string {
  const profiles = repositories
    .map(describeRepository)
    .filter(Boolean) as string[];
  if (profiles.length === 0) {
    return "";
  }

  const header = [
    "Use repository metadata (tags, topics, languages, roles) to bias findings toward the relevant stack and hosting model."
  ];
  if (applicationName) {
    header.push(`Application: ${applicationName}`);
  }

  const parts = [...header, "Repository context:", ...profiles];

  if (knowledgeContext) {
    parts.push(
      "",
      "## Stack Security Knowledge",
      "Use this authoritative context for stack-specific security patterns. This information is verified and up-to-date:",
      knowledgeContext
    );
  }

  return parts.join("\n");
}

function formatRuleCard(rule: RuleScanDefinition): string {
  const summaryTemplate = getRuleSummaryTemplateForRule(rule);
  const lines: string[] = [
    "Rule card:",
    `- id: ${rule.id}`,
    `- title: ${rule.title}`,
    `- category: ${rule.category}`
  ];
  if (rule.description) {
    lines.push(`- description: ${rule.description}`);
  }
  if (summaryTemplate) {
    lines.push(`- summary template: ${summaryTemplate}`);
  }
  if (rule.guidance && rule.guidance.length > 0) {
    lines.push("- guidance:");
    for (const tip of rule.guidance) {
      lines.push(`  - ${tip}`);
    }
  }
  return lines.join("\n");
}

export function extractStackTags(metadata: Record<string, unknown>): string[] {
  const tags = new Map<string, string>();
  const addValues = (values: string[]) => {
    for (const value of values) {
      const normalized = value.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (!tags.has(key)) {
        tags.set(key, normalized);
      }
    }
  };

  const scalarKeys = [
    "language",
    "primary_language",
    "primaryLanguage",
    "runtime",
    "platform",
    "hosting",
    "service_type",
    "serviceType",
    "deployment_target",
    "deploymentTarget",
    "package_manager",
    "packageManager",
    "build_system",
    "buildSystem"
  ];
  for (const key of scalarKeys) {
    addValues(toStrings(metadata[key]));
  }

  const collectionKeys = [
    "languages",
    "topics",
    "tags",
    "labels",
    "framework",
    "frameworks",
    "runtimes",
    "services",
    "stacks"
  ];
  for (const key of collectionKeys) {
    addValues(toStrings(metadata[key]));
  }

  if (typeof metadata.private === "boolean") {
    addValues([metadata.private ? "private" : "public"]);
  } else if (typeof metadata.visibility === "string") {
    addValues([metadata.visibility]);
  }

  return Array.from(tags.values());
}

function describeRepository(repo: RepositoryForScan): string {
  const metadata = repo.providerMetadata ?? {};
  const stackTags = extractStackTags(metadata);
  const visibility = describeVisibility(metadata);
  const repoRoles = (repo.repoRoles ?? []).filter(Boolean) as string[];
  const repoPaths = (repo.repoPaths ?? []).filter((path) => typeof path === "string");
  const focus = deriveFocusAreas(stackTags, repoRoles);

  const descriptors: string[] = [];
  if (stackTags.length) {
    descriptors.push(`stack=${stackTags.join(", ")}`);
  }
  if (repoRoles.length) {
    descriptors.push(`roles=${repoRoles.join(", ")}`);
  }
  const formattedPaths = formatRepoPaths(repoPaths);
  if (formattedPaths) {
    descriptors.push(`paths=${formattedPaths}`);
  }
  if (repo.defaultBranch) {
    descriptors.push(`defaultBranch=${repo.defaultBranch}`);
  }
  if (visibility) {
    descriptors.push(`visibility=${visibility}`);
  }

  const baseLine = descriptors.length
    ? `- ${repo.fullName}: ${descriptors.join("; ")}`
    : `- ${repo.fullName}: minimal metadata provided`;

  if (focus.length) {
    return `${baseLine}\n  Focus: ${focus.join(" | ")}`;
  }
  return baseLine;
}

function formatRepoPaths(paths: string[]): string | null {
  const normalized = Array.from(new Set(paths.map((path) => path.trim()).filter(Boolean)));
  if (!normalized.length) {
    return null;
  }
  const limited = normalized.slice(0, 3);
  const suffix = normalized.length > limited.length ? ", ..." : "";
  return `${limited.join(", ")}${suffix}`;
}

function deriveFocusAreas(stackTags: string[], repoRoles: string[] = []): string[] {
  const focus = new Set<string>();
  const normalized = stackTags.map((tag) => tag.toLowerCase());
  const add = (note: string) => {
    const trimmed = note.trim();
    if (trimmed) {
      focus.add(trimmed);
    }
  };

  if (repoRoles.some((role) => role === "infra")) {
    add("Infra repo: validate IaC state storage, IAM scope, public ingress, and secrets handling.");
  }

  const heuristics = [
    {
      keywords: ["react", "frontend", "next.js", "nextjs", "vue", "spa"],
      note: "Frontend stack: check env var exposure, build/runtime secrets, auth/OAuth redirect settings, and CSP/headers."
    },
    {
      keywords: [
        "node",
        "typescript",
        "javascript",
        "express",
        "npm",
        "yarn",
        "pnpm"
      ],
      note: "Node/JS: review package manager lockfiles, auth middleware defaults, SSRF/file access, and .npmrc token handling."
    },
    {
      keywords: ["python", "django", "flask", "fastapi"],
      note: "Python: ensure dependency pinning, secret handling (.env/config), debug flags off, and session/auth settings."
    },
    {
      keywords: ["terraform", "pulumi", "cloudformation"],
      note: "IaC: enforce encrypted state backends, scoped IAM policies, limited public ingress, and secret rotation."
    },
    {
      keywords: ["kubernetes", "helm", "k8s"],
      note: "Kubernetes: review RBAC scope, service exposure, network policies, and secrets/configmaps with credentials."
    },
    {
      keywords: ["docker", "container", "oci"],
      note: "Containers: pin base images, avoid root users, strip secrets from build args/env, and minimize image surface."
    },
    {
      keywords: ["java", "spring", "maven", "gradle"],
      note: "JVM: check dependency pinning, actuator/admin exposure, TLS defaults, and secret storage in properties/yaml."
    },
    {
      keywords: ["go", "golang"],
      note: "Go: verify module proxy settings, vendoring where needed, and input validation for HTTP/gRPC handlers."
    }
  ];

  for (const { keywords, note } of heuristics) {
    if (keywords.some((keyword) => normalized.some((tag) => tag.includes(keyword)))) {
      add(note);
    }
  }

  return Array.from(focus).slice(0, 3);
}

function describeVisibility(metadata: Record<string, unknown>): string | null {
  if (typeof metadata.private === "boolean") {
    return metadata.private ? "private" : "public";
  }
  if (typeof metadata.visibility === "string") {
    const value = metadata.visibility.trim();
    return value ? value : null;
  }
  return null;
}

function toStrings(value: unknown): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => toStrings(item));
  }
  if (typeof value === "object") {
    const entries: string[] = [];
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (key) {
        entries.push(key);
      }
      if (typeof val === "string" || typeof val === "number") {
        entries.push(String(val));
      }
    }
    return entries;
  }
  return [];
}
