import type { RuleScanDefinition } from "../catalog/repositoryRuleCatalog.js";

type RepositoryForScan = {
  fullName: string;
  defaultBranch?: string | null;
  providerMetadata?: Record<string, unknown> | null;
  repoRoles?: string[] | null;
  repoPaths?: string[] | null;
};

export const BASE_SCAN_PROMPT = [
    "You are a senior application security engineer reviewing a real production repository.",
    "",
    "You are given:",
    "- Repository metadata",
    "- Sampled code chunks (path, lines, content)",
    "- LLM chunk understanding summaries (role, inputs, sinks)",
    "- Family mapping candidates (for prioritization)",
    "- Existing static scanner findings",
    "",
    "Security headers:",
    "- Each chunk begins with a SECURITY HEADER (ENTRY_POINT, EXECUTION_ROLE, TRUST_BOUNDARIES, AUTHENTICATION, AUTHORIZATION, INPUT_SOURCES, DATA_SENSITIVITY, SINKS, SECURITY_ASSUMPTIONS).",
    "- Treat header fields as optional context; do not treat header lines as source code.",
    "- Line numbers refer to the original file; ignore header lines when reporting locations.",
    "",
    "Treat existing static findings as already reported.",
    "Do NOT duplicate them.",
    "",
    "Your task is to identify NEW, high-impact vulnerabilities -- especially those caused by missing or incomplete security controls.",
    "Use the LLM understanding and threat mapping as hints only; verify against code evidence.",
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
    "- Include details.confidence as one of: high | medium | low",
    "- Evidence MUST be grounded in the provided chunk body (not the SECURITY HEADER):",
    "  - Include 1-3 short verbatim code quotes (exact substrings) in evidence[]",
    "  - Keep each quote <= 200 chars",
    "  - If you cannot quote supporting code, set details.confidence=low and avoid reporting unless impact is clear",
    "- If a SECURITY HEADER is present, copy entry point/sink context into details.entryPoint and details.sinks; include details.primarySymbol when clear",
    "",
    "Guardrails:",
    "- Only report rate limiting or audit logging gaps on server-side handlers/middleware (API routes, server functions).",
    "- Lockout/anti-bruteforce gaps may be reported from login flows even when the evidence is in UI/server actions (e.g., a login page that triggers password sign-in) as long as the flow clearly performs authentication attempts and there is no backoff/CAPTCHA/lockout shown.",
    "- Do not flag unrelated UI components or generic client SDK initialization for backend-only controls.",
    "- Do not cite package.json, lockfiles, or other non-executable config files as evidence for runtime vulnerabilities.",
    "- Do NOT report missing_authentication on login/signup/token issuance endpoints; those are expected to be public.",
    "- Only report data_exposure or verbose_error_messages when exposure appears public or missing auth/role checks; admin-only endpoints are not data_exposure by default.",
    "",
    "Family mapping candidates are prioritization hints; if evidence supports them, prefer emitting them.",
    "You MAY infer vulnerabilities from the ABSENCE of expected checks.",
    "Do not require exploit code.",
    "",
    "Return findings strictly in the JSON schema provided.",
    "Prefer fewer, higher-signal findings; include additional findings only when strongly supported by evidence."
  ].join("\n");

export const BASE_RULE_EVAL_PROMPT = [
  "You are a security reviewer performing a rule-scoped scan over a code chunk.",
  "",
  "Security header handling:",
  "- Each chunk may begin with a SECURITY HEADER. It is metadata only; do not treat header lines as code evidence.",
  "",
  "Static scanner findings are already reported. Do NOT duplicate them.",
  "",
  "Task:",
  "- For the provided rule(s), decide whether the risk applies based on the chunk evidence.",
  "- If evidence is insufficient or ambiguous, return an empty findings array.",
  "",
  "Evidence requirements:",
  "- Evidence MUST be grounded in the chunk body (not the SECURITY HEADER).",
  "- Include 1-3 short verbatim quotes (<=200 chars) in evidence[].",
  "- If evidence is not explicit, do NOT emit a finding.",
  "",
  "Conservative behavior:",
  "- Prefer no findings over guessing.",
  "- Only infer missing controls when the shown handler/flow clearly should contain it and the absence is unambiguous.",
  "",
  "Guardrails:",
  "- Do NOT report missing_authentication on login/signup/token issuance endpoints.",
  "- Only report server-side control gaps (rate limiting, audit logging) on server handlers/middleware; do not flag UI components or SDK initialization.",
  "",
  "Return findings strictly in the provided JSON schema."
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
    "- Admin endpoints missing MFA/2FA enforcement",
    "- Login flows missing lockout/backoff/CAPTCHA (unlimited attempts)",
    "- Trusting client-provided orgId or userId",
    "- Tenant isolation missing for org/tenant list queries (unscoped access)",
    "- Missing rate limiting on sensitive actions",
    "- Missing audit logging on destructive actions",
    "- Missing bearer tokens or empty/placeholder bearer tokens on protected requests",
    "- Webhooks without signature verification",
    "- Webhook signature verification using weak or fallback secrets",
    "- Webhook config payloads fetched without integrity checks",
    "- Debug endpoints leaking auth context or request headers",
    "- Sensitive data logged in plaintext",
    "- Overly permissive CORS configuration",
    "- Public storage buckets or object storage configured as public",
    "- Unbounded queries or missing pagination",
    "- Missing timeouts on external calls",
    "- Upload handlers missing payload size limits",
    "- Retry storms or unbounded retries around external calls or job execution",
    "",
    "Good control references (examples only; accept equivalent variants):",
    "- IDOR: query scoped by owner/tenant from server auth context (e.g., where owner_id = auth.user.id)",
    "- Frontend-only auth: backend enforces role/ownership checks, not just UI gating",
    "- Admin role checks: explicit role/permission guard in the handler/middleware",
    "- MFA: enforce 2FA/OTP/WebAuthn for admin-sensitive actions",
    "- orgId/userId trust: derive from session/JWT/claims, ignore client-supplied IDs",
    "- Rate limiting: middleware/guard applied to sensitive actions (login, token, invite, delete)",
    "- Audit logging: structured log/event with actor + target on destructive changes",
    "- Webhooks: signature verification with shared secret + replay protection (timestamp/nonce)",
    "- Webhook config integrity: verify config URLs/payloads with signatures, hashes, or allowlisted sources",
    "- Sensitive logs: secrets/PII redacted or omitted from logs",
    "- Pagination: limit/range/offset or cursor applied to list queries",
    "- Timeouts: explicit timeout/abort controller for external calls or subprocesses",
    "- Retries: capped retries with backoff/circuit breakers for failing external calls",
    "- Upload size limits: enforce max content-length/body size and file-size limits before processing",
    "",
    "For each file:",
    "- Use the chunk understanding summary to determine which security controls are likely required",
    "- Explicitly evaluate whether each expected control is present or missing",
    "- Missing expected controls SHOULD be reported as findings"
  ].join("\n");
}

export function buildRepositoryRuleSystemPrompt(rule: RuleScanDefinition): string {
  const ruleCard = formatRuleCardCompact(rule);
  const extraGuidance: string[] = [];
  if (rule.id === "sql_injection") {
    extraGuidance.push(
      "SQL injection helper guidance:",
      "- Also report raw-SQL helper wrappers that accept a SQL string parameter (e.g., function runQuery(sql: string), unsafeSql(sql: string)).",
      "- Even if the snippet is a stub/placeholder (e.g., only logs the SQL), treat it as a dangerous raw-SQL execution pattern and report it.",
      "- Evidence can be: the function signature (takes sql: string) + log message implying execution (e.g., \"Executing SQL\", \"Running SQL\").",
      "- Do NOT require a real DB driver call to be present in the chunk to report this helper pattern."
    );
  }
  if (rule.id === "missing_lockout") {
    extraGuidance.push(
      "Lockout/bruteforce guidance:",
      "- If the chunk shows a login attempt (password sign-in) and there is no backoff/lockout/CAPTCHA logic, report missing_lockout.",
      "- It is valid to report based on the login UI/server action code when that code triggers password sign-in (e.g., signInWithPassword).",
      "- Evidence can be absence-of-control: there is no delay counters, no attempt tracking, no CAPTCHA, no lockout messaging or state.",
      "- Do not confuse missing credential validation bugs with lockout bugs; focus on brute-force defenses."
    );
  }
  if (rule.id === "missing_rate_limiting") {
    extraGuidance.push(
      "Rate limiting guidance:",
      "- Report when a server-side handler performs login, token issuance, password reset, invite, delete, or other sensitive actions and there is no visible rate limiting/backoff/guard in the handler or referenced middleware.",
      "- Do NOT report on client-only helpers or UI components.",
      "- Login endpoints are expected to be public; do not confuse missing_authentication with missing_rate_limiting.",
      "- Comments/feature flags indicating a missing or disabled limiter count as missing."
    );
  }
  if (rule.id === "missing_timeout") {
    extraGuidance.push(
      "Timeout guidance:",
      "- Treat HTTP calls and subprocess executions (fetch/axios, child_process exec/execFile/spawn, Deno.Command) as external calls that should be bounded.",
      "- Report when no explicit timeout/abort signal is passed and the code can block indefinitely.",
      "- If the code retries failures in a tight loop without backoff/cap, mention retry-storm risk alongside missing timeouts."
    );
  }
  if (rule.id === "unbounded_query") {
    extraGuidance.push(
      "Unbounded query guidance:",
      "- Report list/export handlers that return all rows without pagination (limit/range/offset/cursor).",
      "- Raw SQL like `SELECT * ...` without LIMIT/OFFSET or ORM queries without `.limit`/`.range` are strong signals.",
      "- Do NOT require seeing pagination helpers elsewhere; the handler should enforce a cap in the shown code."
    );
  }
  if (rule.id === "missing_admin_mfa") {
    extraGuidance.push(
      "Admin MFA guidance:",
      "- Treat paths containing /admin (or symbols named admin*) as privileged endpoints.",
      "- Role/permission checks (e.g., auth.role === \"admin\") are NOT MFA; they satisfy authz only.",
      "- If the handler uses only basic session/JWT auth and there is no step-up check (MFA/OTP/WebAuthn/reauth or mfa-level claim) in the handler or referenced middleware, report missing_admin_mfa.",
      "- Do not assume global login MFA unless there is explicit evidence in code (e.g., amr/acr/mfa claim checks or step-up middleware).",
      "- Evidence can be: auth context read + admin data access (including read-only lists) or mutation without any MFA check."
    );
  }
  if (rule.id === "missing_authentication") {
    extraGuidance.push(
      "Missing authentication guidance:",
      "- Do NOT report on login/signup/token issuance endpoints; those are public by design.",
      "- Only report when the handler performs sensitive actions without any auth/session validation."
    );
  }
  if (rule.id === "missing_bearer_token") {
    extraGuidance.push(
      "Bearer token guidance:",
      "- Report when code sends Authorization: Bearer using a token that can be empty (nullish coalescing, logical OR, optional chaining) or unvalidated client state.",
      "- Treat frontend session tokens (from client auth SDKs or localStorage) as attacker-controlled; if they can be empty, report.",
      "- Phrase impact as: requests can be sent with empty or forged access tokens; server-side must verify and reject.",
      "- Evidence can be: `const accessToken = ... ?? \"\"` and `authorization: `Bearer ${accessToken}``."
    );
  }

  return [
    BASE_RULE_EVAL_PROMPT,
    "",
    "This scan is rule-scoped.",
    "You may ONLY report findings for the rule below.",
    "If evidence is insufficient or the rule does not apply, return an empty findings array.",
    "Be conservative: do NOT infer missing controls unless the chunk clearly shows the relevant handler/operation and the absence is unambiguous.",
    "Do not guess based on best practices; only report what the code supports.",
    ...(extraGuidance.length ? ["", ...extraGuidance] : []),
    "",
    ruleCard,
    "",
    "Output requirements:",
    "- Set finding.type to the rule id.",
    "- Set details.ruleId to the rule id."
  ].join("\n");
}

export function buildRepositoryRuleBatchSystemPrompt(
  rules: RuleScanDefinition[]
): string {
  if (rules.length === 1) {
    return buildRepositoryRuleSystemPrompt(rules[0]);
  }
  const ruleCards = rules.map(formatRuleCardCompact).join("\n\n");
  const ruleIds = rules.map((rule) => rule.id).join(", ");
  const hasSqlInjection = rules.some((rule) => rule.id === "sql_injection");
  const extraGuidance: string[] = [];
  if (hasSqlInjection) {
    extraGuidance.push(
      "SQL injection helper guidance (applies only when emitting ruleId=sql_injection):",
      "- Also report raw-SQL helper wrappers that accept a SQL string parameter (e.g., function runQuery(sql: string), unsafeSql(sql: string)).",
      "- Even if the snippet is a stub/placeholder (e.g., only logs the SQL), treat it as a dangerous raw-SQL execution pattern and report it.",
      "- Evidence can be: the function signature (takes sql: string) + log message implying execution (e.g., \"Executing SQL\", \"Running SQL\").",
      "- Do NOT require a real DB driver call to be present in the chunk to report this helper pattern."
    );
  }

  return [
    BASE_RULE_EVAL_PROMPT,
    "",
    "This scan is rule-scoped.",
    "You may ONLY report findings for the rules below.",
    "If evidence is insufficient or the rules do not apply, return an empty findings array.",
    "Be conservative: do NOT infer missing controls unless the chunk clearly shows the relevant handler/operation and the absence is unambiguous.",
    "Do not guess based on best practices; only report what the code supports.",
    ...(extraGuidance.length ? ["", ...extraGuidance] : []),
    "",
    `Allowed rule ids: ${ruleIds}`,
    "",
    ruleCards,
    "",
    "Output requirements:",
    "- Set finding.type to one of the rule ids above.",
    "- Set details.ruleId to one of the rule ids above."
  ].join("\n");
}

export function buildRepositoryCompositeSystemPrompt(): string {
  return [
    "You are a senior application security engineer performing a second-pass analysis over findings.",
    "",
    "You are given:",
    "- Repository metadata",
    "- Findings from static scanners",
    "- Findings from the first-pass AI scan",
    "",
    "Do NOT re-scan code. Only reason over the provided findings and repository context.",
    "",
    "Your task is to identify composite, chained, or systemic vulnerabilities.",
    "Examples: privilege escalation paths, tenant isolation failures across endpoints, combined authz weaknesses, or systemic missing controls.",
    "",
    "Rules:",
    "- Do not repeat existing findings verbatim.",
    "- Prefer fewer, higher-signal composite findings (max 5).",
    "- Severity should reflect combined impact and likelihood.",
    "- If a composite finding depends on multiple inputs, mention them in details.relatedFindings (summaries or short identifiers).",
    "",
    "Return findings strictly in the JSON schema provided.",
    "Location may be null when the issue is repository-wide."
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
          confidence: "high",
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

export function formatRuleCardFull(rule: RuleScanDefinition): string {
  const lines: string[] = [
    "Rule card:",
    `- id: ${rule.id}`,
    `- title: ${rule.title}`,
    `- category: ${rule.category}`
  ];
  if (rule.description) {
    lines.push(`- description: ${rule.description}`);
  }
  if (rule.guidance && rule.guidance.length > 0) {
    lines.push("- guidance:");
    for (const tip of rule.guidance) {
      lines.push(`  - ${tip}`);
    }
  }
  return lines.join("\n");
}

export function formatRuleCardCompact(rule: RuleScanDefinition): string {
  const lines: string[] = [
    "Rule card:",
    `- id: ${rule.id}`,
    `- title: ${rule.title}`,
    `- category: ${rule.category}`
  ];
  if (rule.description) {
    lines.push(`- description: ${rule.description}`);
  }
  const questions = (rule.evidenceQuestions ?? []).filter(Boolean).slice(0, 3);
  if (questions.length > 0) {
    lines.push("- evidenceQuestions:");
    for (const question of questions) {
      lines.push(`  - ${question}`);
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
