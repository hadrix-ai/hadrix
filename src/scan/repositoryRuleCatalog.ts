export type RuleScanDefinition = {
  id: string;
  title: string;
  category: string;
  description: string;
  summaryTemplate?: string;
  guidance?: string[];
  requiredControls?: string[];
  candidateTypes?: string[];
};

export const REPOSITORY_SCAN_RULES: RuleScanDefinition[] = [
  {
    id: "missing_authentication",
    title: "Missing authentication on server-side handler",
    category: "authentication",
    description: "Server endpoints accept requests without verifying identity or session.",
    requiredControls: ["authentication"],
    guidance: [
      "Look for auth/session validation or middleware guards.",
      "Report only when the handler performs sensitive actions without auth."
    ]
  },
  {
    id: "missing_server_action_auth",
    title: "Missing authentication/authorization in server actions",
    category: "authentication",
    description: "Server Actions perform mutations without verifying the caller's session or permissions.",
    requiredControls: ["no_frontend_only_auth"],
    guidance: [
      "Treat Server Actions (\"use server\") as public endpoints; enforce auth inside the action, not only in UI or layout guards.",
      "Verify the session user is allowed to perform the mutation before executing data writes."
    ]
  },
  {
    id: "missing_role_check",
    title: "Missing role checks on admin endpoint",
    category: "access_control",
    description: "Admin handlers lack server-side role or permission enforcement.",
    requiredControls: ["authorization:role"],
    candidateTypes: ["missing_role_check"],
    guidance: [
      "Admin endpoints should validate roles/permissions on the server.",
      "Do not accept UI-only gating as sufficient."
    ]
  },
  {
    id: "idor",
    title: "Insecure direct object reference (IDOR)",
    category: "access_control",
    description: "Resources are fetched or mutated by ID without ownership or tenant validation.",
    requiredControls: ["authorization:ownership_or_membership"],
    candidateTypes: ["idor"],
    guidance: [
      "Verify queries scope records to the authenticated user or tenant.",
      "Flag missing ownership checks when IDs come from user input."
    ]
  },
  {
    id: "missing_rate_limiting",
    title: "Missing rate limiting on sensitive actions",
    category: "configuration",
    description: "Sensitive actions lack rate limiting or throttling.",
    requiredControls: ["rate_limiting"],
    candidateTypes: ["missing_rate_limiting"],
    guidance: [
      "Focus on login, token issuance, destructive actions, or high-volume listings.",
      "Accept middleware or shared guard implementations."
    ]
  },
  {
    id: "missing_lockout",
    title: "Missing lockout protections on login endpoints",
    category: "authentication",
    description: "Login flows lack account lockout or brute-force defenses.",
    candidateTypes: ["missing_lockout"],
    guidance: [
      "Require account lockout or escalating delays after repeated failed login attempts.",
      "CAPTCHA or challenge-based defenses can be valid alternatives."
    ]
  },
  {
    id: "missing_mfa",
    title: "Missing multi-factor authentication on privileged actions",
    category: "authentication",
    description: "Privileged admin actions or authentication flows do not enforce MFA/2FA step-up.",
    candidateTypes: ["missing_mfa"],
    guidance: [
      "Prioritize admin login and member/role management flows that should require step-up MFA.",
      "Accept OTP/TOTP, WebAuthn/passkeys, or equivalent MFA enforcement."
    ]
  },
  {
    id: "missing_audit_logging",
    title: "Missing audit logging on destructive actions",
    category: "configuration",
    description: "Destructive or privileged actions do not emit audit logs.",
    requiredControls: ["audit_logging"],
    candidateTypes: ["missing_audit_logging"],
    guidance: [
      "Audit logs should capture actor, target, and action.",
      "Only report when destructive/sensitive actions are present."
    ]
  },
  {
    id: "missing_timeout",
    title: "Missing timeouts on external calls",
    category: "configuration",
    description: "External calls or subprocesses are invoked without timeouts.",
    requiredControls: ["timeout"],
    candidateTypes: ["missing_timeout"],
    guidance: [
      "Look for HTTP requests or exec calls without abort/timeout handling.",
      "Ignore calls that already pass explicit timeout options."
    ]
  },
  {
    id: "frontend_only_authorization",
    title: "Frontend-only authorization enforcement",
    category: "access_control",
    description: "Authorization checks exist only in the UI without server enforcement.",
    requiredControls: ["no_frontend_only_auth"],
    candidateTypes: ["frontend_only_authorization"],
    guidance: [
      "UI role checks must be backed by server-side checks.",
      "Report when backend handlers lack equivalent enforcement."
    ]
  },
  {
    id: "frontend_direct_db_write",
    title: "Frontend performs direct database writes",
    category: "access_control",
    description:
      "Client-side code writes to the database directly instead of using server or edge functions.",
    candidateTypes: ["frontend_direct_db_write"],
    guidance: [
      "Move write operations behind API/edge functions or server actions.",
      "Enforce strict RLS policies on tables touched by client writes.",
      "Add server-side rate limiting and audit logging for write endpoints."
    ]
  },
  {
    id: "dangerous_html_render",
    title: "Dangerous HTML rendering (XSS risk)",
    category: "injection",
    description: "Untrusted HTML is rendered without sanitization.",
    requiredControls: ["secure_rendering"],
    candidateTypes: ["dangerous_html_render"],
    guidance: [
      "Look for dangerouslySetInnerHTML or raw HTML rendering of user content.",
      "Ensure sanitization or safe rendering is present."
    ]
  },
  {
    id: "frontend_secret_exposure",
    title: "Sensitive secrets exposed in frontend code",
    category: "secrets",
    description: "Client bundles include credentials or secrets.",
    requiredControls: ["no_sensitive_secrets"],
    candidateTypes: ["frontend_secret_exposure"],
    guidance: [
      "Frontend code should not embed private keys, service secrets, or admin tokens."
    ]
  },
  {
    id: "sensitive_client_storage",
    title: "Sensitive data stored in client-side storage",
    category: "secrets",
    description: "Tokens, secrets, or PII are persisted in localStorage or sessionStorage.",
    requiredControls: ["no_sensitive_secrets"],
    guidance: [
      "Only report when code explicitly writes sensitive values to browser storage APIs (localStorage, sessionStorage, AsyncStorage, IndexedDB, cookies).",
      "Do not store access tokens, refresh tokens, or session IDs in localStorage/sessionStorage.",
      "Persist only non-sensitive preferences; keep PII and secrets on the server or in httpOnly cookies."
    ]
  },
  {
    id: "missing_webhook_signature",
    title: "Missing webhook signature verification",
    category: "authentication",
    description: "Webhook handlers process requests without verifying a signature.",
    requiredControls: ["signature_verification"],
    candidateTypes: ["missing_webhook_signature"],
    guidance: [
      "Require signature verification with shared secret and timing-safe compare.",
      "Prefer replay protection when available."
    ]
  },
  {
    id: "missing_webhook_config_integrity",
    title: "Missing webhook config integrity checks",
    category: "configuration",
    description: "Webhook handlers fetch or apply configuration payloads without integrity verification.",
    candidateTypes: ["missing_webhook_config_integrity"],
    guidance: [
      "Verify external config URLs or payloads with signatures, hashes, or allowlisted sources.",
      "Treat config payloads from webhooks as untrusted input."
    ]
  },
  {
    id: "missing_replay_protection",
    title: "Missing webhook replay protection",
    category: "authentication",
    description: "Webhook handlers accept requests without timestamp or nonce validation.",
    requiredControls: ["replay_protection"],
    guidance: [
      "Look for timestamp or nonce checks that prevent replay.",
      "Do not report if replay protection is handled in shared middleware."
    ]
  },
  {
    id: "missing_secure_token_handling",
    title: "Missing secure token handling",
    category: "authentication",
    description: "Tokens are issued or verified without secure handling or validation.",
    requiredControls: ["secure_token_handling"],
    candidateTypes: ["magic_link_no_expiration"],
    guidance: [
      "Ensure token validation, rotation, and secure storage patterns.",
      "Flag weak or missing verification in auth flows."
    ]
  },
  {
    id: "missing_input_validation",
    title: "Missing input validation",
    category: "configuration",
    description: "Untrusted input is used without validation or schema checks.",
    requiredControls: ["input_validation"],
    guidance: [
      "Validate user input before it is used in queries, commands, or writes."
    ]
  },
  {
    id: "missing_least_privilege",
    title: "Missing least-privilege enforcement",
    category: "configuration",
    description: "Background jobs or services use overly broad permissions.",
    requiredControls: ["least_privilege"],
    candidateTypes: ["missing_least_privilege"],
    guidance: [
      "Prefer scoped credentials and minimal permissions for jobs and workers."
    ]
  },
  {
    id: "plaintext_secrets",
    title: "Secrets stored in plaintext",
    category: "secrets",
    description: "Secrets or credentials are stored without encryption.",
    requiredControls: ["no_plaintext_secrets"],
    guidance: [
      "Secrets should be encrypted or stored in secret managers."
    ]
  },
  {
    id: "weak_rls_policies",
    title: "Weak or missing RLS policies",
    category: "access_control",
    description: "Row-level security policies do not enforce tenant isolation.",
    requiredControls: ["secure_rls_policies"],
    guidance: [
      "Policies should constrain access by tenant or owner context.",
      "Prefer routing writes through API/edge functions even with RLS to enable rate limiting and auditing."
    ]
  },
  {
    id: "missing_output_sanitization",
    title: "Missing output sanitization",
    category: "configuration",
    description: "Outputs derived from untrusted input are returned without sanitization.",
    requiredControls: ["output_sanitization"],
    guidance: [
      "Sanitize outputs from exec commands or user-controlled content."
    ]
  },
  {
    id: "sql_injection",
    title: "SQL injection",
    category: "injection",
    description: "Queries are built using raw SQL with user-controlled input.",
    candidateTypes: ["sql_injection"]
  },
  {
    id: "unsafe_query_builder",
    title: "Unsafe query builder usage",
    category: "injection",
    description: "Query builder filters appear to be composed from untrusted input.",
    candidateTypes: ["unsafe_query_builder"]
  },
  {
    id: "command_injection",
    title: "Command injection",
    category: "injection",
    description: "Shell or exec commands are constructed from untrusted input.",
    candidateTypes: ["command_injection"]
  },
  {
    id: "org_id_trust",
    title: "Trusting client-supplied org or user IDs",
    category: "access_control",
    description: "Org/user identifiers are accepted from the client without verification.",
    candidateTypes: ["org_id_trust"]
  },
  {
    id: "debug_auth_leak",
    title: "Debug endpoint leaks auth context",
    category: "authentication",
    description: "Debug or logging endpoints expose auth headers or request context.",
    candidateTypes: ["debug_auth_leak"]
  },
  {
    id: "webhook_code_execution",
    title: "Webhook handler allows code execution",
    category: "authentication",
    description: "Webhook inputs are used to trigger code execution paths.",
    candidateTypes: ["webhook_code_execution"]
  },
  {
    id: "permissive_cors",
    title: "Permissive CORS configuration",
    category: "configuration",
    description: "CORS allows overly broad origins or credentials.",
    candidateTypes: ["permissive_cors"]
  },
  {
    id: "jwt_validation_bypass",
    title: "JWT validation bypass",
    category: "authentication",
    description: "JWT verification can be bypassed or uses weak validation.",
    candidateTypes: ["jwt_validation_bypass"]
  },
  {
    id: "weak_jwt_secret",
    title: "Weak JWT secret",
    category: "authentication",
    description: "JWT secrets are hardcoded, weak, or easily guessable.",
    candidateTypes: ["weak_jwt_secret"]
  },
  {
    id: "weak_token_generation",
    title: "Weak token generation",
    category: "authentication",
    description: "Tokens are generated using predictable or insecure methods.",
    candidateTypes: ["weak_token_generation"]
  },
  {
    id: "sensitive_logging",
    title: "Sensitive data logged in plaintext",
    category: "secrets",
    description: "Sensitive data is logged without redaction.",
    candidateTypes: ["sensitive_logging"]
  },
  {
    id: "command_output_logging",
    title: "Command output logging of sensitive data",
    category: "secrets",
    description: "Command outputs containing sensitive data are logged.",
    candidateTypes: ["command_output_logging"]
  },
  {
    id: "unbounded_query",
    title: "Unbounded query without pagination",
    category: "configuration",
    description: "List queries fetch all rows without limit or pagination.",
    candidateTypes: ["unbounded_query"]
  },
  {
    id: "anon_key_bearer",
    title: "Anon key used as bearer credential",
    category: "authentication",
    description: "Public anon keys are used as bearer tokens for privileged actions.",
    candidateTypes: ["anon_key_bearer"]
  },
  {
    id: "missing_bearer_token",
    title: "Missing bearer token on protected requests",
    category: "authentication",
    description: "Requests are sent without bearer tokens for protected endpoints.",
    candidateTypes: ["missing_bearer_token"]
  },
  {
    id: "frontend_login_rate_limit",
    title: "Missing client-side rate limiting on login",
    category: "configuration",
    description: "Login flows lack client-side backoff or throttling signals.",
    candidateTypes: ["frontend_login_rate_limit"]
  },
  {
    id: "session_fixation",
    title: "Session fixation",
    category: "authentication",
    description: "Session identifiers are reused across authentication changes or logins.",
    requiredControls: ["secure_token_handling"],
    guidance: [
      "Regenerate session IDs on login, privilege changes, and logout.",
      "Invalidate pre-auth sessions instead of reusing them."
    ]
  },
  {
    id: "weak_password_hashing",
    title: "Weak password hashing",
    category: "authentication",
    description: "Passwords are hashed with fast or deprecated algorithms without adaptive hashing.",
    requiredControls: ["secure_token_handling"],
    guidance: [
      "Use bcrypt, Argon2id, or scrypt with per-user salts and adequate cost.",
      "Avoid MD5, SHA-1, or SHA-256 for password storage."
    ]
  },
  {
    id: "weak_encryption",
    title: "Weak or deprecated encryption",
    category: "authentication",
    description: "Data is encrypted or signed with deprecated algorithms or insecure modes.",
    requiredControls: ["secure_token_handling"],
    guidance: [
      "Use AES-GCM or ChaCha20-Poly1305 with random nonces.",
      "Avoid ECB mode, DES, MD5, or SHA-1 for security use cases."
    ]
  },
  {
    id: "mass_assignment",
    title: "Mass assignment of user-controlled fields",
    category: "business_logic",
    description: "Endpoints bind entire request bodies to models without field allowlists.",
    candidateTypes: ["mass_assignment"],
    guidance: [
      "Allowlist writable fields or map through DTOs.",
      "Never accept role, ownership, pricing, or status fields from clients."
    ]
  },
  {
    id: "excessive_data_exposure",
    title: "Excessive data exposure in API responses",
    category: "business_logic",
    description: "API responses include internal or sensitive fields instead of a safe DTO.",
    requiredControls: ["authorization:ownership_or_membership"],
    guidance: [
      "Return DTOs/allowlisted fields instead of full ORM objects.",
      "Strip secrets and internal metadata from responses."
    ]
  },
  {
    id: "path_traversal",
    title: "Path traversal",
    category: "injection",
    description: "User-controlled file paths access files outside allowed directories.",
    requiredControls: ["input_validation"],
    guidance: [
      "Normalize paths and enforce base directory allowlists.",
      "Reject '..', absolute paths, or encoded traversal sequences."
    ]
  },
  {
    id: "missing_upload_size_limit",
    title: "Missing upload size limits",
    category: "configuration",
    description: "Upload handlers accept large payloads without enforcing size limits.",
    candidateTypes: ["missing_upload_size_limit"],
    guidance: [
      "Enforce max upload sizes at the server or middleware level.",
      "Reject oversized payloads before buffering or storing them."
    ]
  },
  {
    id: "unrestricted_file_upload",
    title: "Unrestricted file upload",
    category: "configuration",
    description: "Uploads accept arbitrary files or filenames without validation.",
    requiredControls: ["input_validation"],
    guidance: [
      "Validate extension, MIME type, and size before storing.",
      "Store with server-generated names outside executable paths."
    ]
  },
  {
    id: "nosql_injection",
    title: "NoSQL injection",
    category: "injection",
    description: "NoSQL queries are built from untrusted input without allowlisting.",
    requiredControls: ["input_validation"],
    guidance: [
      "Use typed query builders and allowlist operators/fields.",
      "Reject operator objects like $where or $gt from client input."
    ]
  },
  {
    id: "ldap_injection",
    title: "LDAP injection",
    category: "injection",
    description: "LDAP filters include unescaped user input.",
    requiredControls: ["input_validation"],
    guidance: [
      "Escape LDAP special characters in filters.",
      "Prefer bind-based auth instead of filter matching."
    ]
  },
  {
    id: "xpath_injection",
    title: "XPath injection",
    category: "injection",
    description: "XPath expressions include unescaped user input.",
    requiredControls: ["input_validation"],
    guidance: [
      "Use parameterized XPath APIs or strict input allowlists.",
      "Escape quotes and special XPath characters."
    ]
  },
  {
    id: "template_injection",
    title: "Template injection (SSTI)",
    category: "injection",
    description: "Templates render untrusted input in server-side template engines.",
    requiredControls: ["input_validation"],
    guidance: [
      "Do not render user-supplied templates or expressions.",
      "Escape user input and disable dangerous template features."
    ]
  },
  {
    id: "log_injection",
    title: "Log injection",
    category: "configuration",
    description: "Untrusted input is written to logs without sanitization.",
    requiredControls: ["output_sanitization"],
    guidance: [
      "Sanitize newlines and control characters in log fields.",
      "Prefer structured logging with explicit fields."
    ]
  },
  {
    id: "insecure_temp_files",
    title: "Insecure temporary file usage",
    category: "configuration",
    description: "Temporary files are created with predictable names or lax permissions.",
    requiredControls: ["least_privilege"],
    guidance: [
      "Use secure temp APIs (mkstemp) with restrictive permissions.",
      "Avoid predictable temp filenames and world-writable dirs."
    ]
  },
  {
    id: "verbose_error_messages",
    title: "Verbose error messages",
    category: "configuration",
    description: "Responses expose stack traces or internal error details.",
    requiredControls: ["authentication"],
    guidance: [
      "Return generic errors to clients and log details internally.",
      "Avoid exposing stack traces, file paths, or SQL queries."
    ]
  },
  {
    id: "debug_mode_in_production",
    title: "Debug mode enabled in production",
    category: "configuration",
    description: "Debug tooling or endpoints are enabled outside development.",
    requiredControls: ["authentication"],
    guidance: [
      "Disable debug flags and routes in production builds.",
      "Gate debug tooling behind explicit environment checks."
    ]
  },
  {
    id: "missing_security_headers",
    title: "Missing security headers",
    category: "configuration",
    description: "Responses omit critical headers like CSP, HSTS, or X-Frame-Options.",
    candidateTypes: ["missing_security_headers"],
    guidance: [
      "Set CSP, HSTS, X-Frame-Options, and X-Content-Type-Options.",
      "Apply headers via default middleware for all responses."
    ]
  }
];

const DEFAULT_SUMMARY_TEMPLATE_SUFFIX = " in {filepath}";

const buildSummaryTemplate = (rule: RuleScanDefinition): string => {
  if (rule.summaryTemplate && rule.summaryTemplate.trim()) {
    return rule.summaryTemplate.trim();
  }
  return `${rule.title}${DEFAULT_SUMMARY_TEMPLATE_SUFFIX}`;
};

const RULE_SUMMARY_TEMPLATE_MAP: Map<string, string> = new Map();
for (const rule of REPOSITORY_SCAN_RULES) {
  const template = buildSummaryTemplate(rule);
  RULE_SUMMARY_TEMPLATE_MAP.set(rule.id, template);
  for (const candidateType of rule.candidateTypes ?? []) {
    RULE_SUMMARY_TEMPLATE_MAP.set(candidateType, template);
  }
}

export function getRuleSummaryTemplate(ruleId?: string | null): string {
  if (typeof ruleId !== "string") return "";
  const normalized = ruleId.trim();
  if (!normalized) return "";
  return RULE_SUMMARY_TEMPLATE_MAP.get(normalized) ?? "";
}

export function getRuleSummaryTemplateForRule(rule: RuleScanDefinition): string {
  return buildSummaryTemplate(rule);
}
