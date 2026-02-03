import type { SignalId } from "../../security/signals.js";

export type RuleScanDefinition = {
  id: string;
  title: string;
  category: string;
  description: string;
  guidance?: string[];
  requiredControls?: string[];
  candidateTypes?: string[];
  requiredAllSignals?: SignalId[];
  requiredAnySignals?: SignalId[];
  optionalSignals?: SignalId[];
};

export const REPOSITORY_SCAN_RULES: RuleScanDefinition[] = [
  {
    id: "missing_authentication",
    title: "Missing authentication on server-side handler",
    category: "authentication",
    description: "Server endpoints accept requests without verifying identity or session.",
    requiredControls: ["authentication"],
    requiredAnySignals: [
      "public_entrypoint",
      "api_handler",
      "webhook_handler",
      "job_worker"
    ],
    optionalSignals: ["authn_missing_or_unknown"],
    guidance: [
      "Look for auth/session validation or middleware guards.",
      "Report only when the handler performs sensitive actions without auth.",
      "Do NOT report on login/signup/token issuance endpoints; those are public by design."
    ]
  },
  {
    id: "missing_server_action_auth",
    title: "Missing authentication/authorization in server actions",
    category: "authentication",
    description: "Server Actions perform mutations without verifying the caller's session or permissions.",
    requiredControls: ["no_frontend_only_auth"],
    requiredAnySignals: ["api_handler", "public_entrypoint"],
    optionalSignals: ["authn_missing_or_unknown", "authz_missing_or_unknown"],
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
    requiredAnySignals: [
      "authz_missing_or_unknown",
      "client_supplied_identifier",
      "client_supplied_org_id",
      "client_supplied_user_id",
      "id_in_path_or_query"
    ],
    optionalSignals: ["authn_present"],
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
    requiredAnySignals: [
      "client_supplied_identifier",
      "client_supplied_org_id",
      "client_supplied_user_id",
      "id_in_path_or_query"
    ],
    optionalSignals: ["authz_missing_or_unknown"],
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
    requiredAnySignals: [
      "rate_limit_missing_or_unknown",
      "public_entrypoint",
      "api_handler",
      "webhook_handler"
    ],
    optionalSignals: ["authn_present"],
    guidance: [
      "Focus on login, token issuance, destructive actions, or high-volume listings.",
      "Accept middleware or shared guard implementations.",
      "Do not report on client-only helpers or UI components.",
      "Login endpoints are expected to be public; do not confuse missing_authentication with missing_rate_limiting.",
      "Comments/feature flags indicating a missing or disabled limiter count as missing."
    ]
  },
  {
    id: "missing_lockout",
    title: "Missing lockout protections on login endpoints",
    category: "authentication",
    description: "Login flows lack account lockout or brute-force defenses.",
    candidateTypes: ["missing_lockout"],
    requiredAnySignals: ["authn_present", "rate_limit_missing_or_unknown"],
    optionalSignals: ["public_entrypoint"],
    guidance: [
      "Report when a login flow performs password sign-in attempts (server route, server action, or client auth call like signInWithPassword) and there is no evidence of lockout/backoff/CAPTCHA after repeated failures.",
      "Accept lockout, progressive delay, CAPTCHA, or other brute-force defenses when explicitly present in the shown code.",
      "Do NOT require seeing a database of login attempts; absence of any backoff/lockout logic in the login handler/page is sufficient when the login attempt logic is clearly shown.",
      "CAPTCHA or challenge-based defenses can be valid alternatives."
    ]
  },
  {
    id: "missing_audit_logging",
    title: "Missing audit logging on destructive actions",
    category: "configuration",
    description: "Destructive or privileged actions do not emit audit logs.",
    requiredControls: ["audit_logging"],
    candidateTypes: ["missing_audit_logging"],
    requiredAnySignals: [
      "api_handler",
      "job_worker",
      "public_entrypoint",
      "internal_entrypoint"
    ],
    optionalSignals: ["authz_present"],
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
    requiredAnySignals: ["http_request_sink", "exec_sink"],
    guidance: [
      "Look for HTTP requests or exec calls without abort/timeout handling.",
      "Treat subprocess calls (child_process exec/execFile/spawn, Deno.Command, Bun.spawn) as external calls that should be bounded by a timeout or abort signal.",
      "If code retries a failing external call in a tight loop without backoff or cap, call out the retry-storm risk alongside the missing timeout.",
      "Ignore calls that already pass explicit timeout options or abort signals."
    ]
  },
  {
    id: "frontend_only_authorization",
    title: "Frontend-only authorization enforcement",
    category: "access_control",
    description: "Authorization checks exist only in the UI without server enforcement.",
    requiredControls: ["no_frontend_only_auth"],
    candidateTypes: ["frontend_only_authorization"],
    requiredAnySignals: ["frontend_dom_write"],
    optionalSignals: ["authz_missing_or_unknown", "api_handler"],
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
    requiredAnySignals: ["orm_query_sink", "raw_sql_sink"],
    optionalSignals: ["frontend_dom_write"],
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
    requiredAnySignals: ["frontend_dom_write", "template_render"],
    optionalSignals: ["unvalidated_input", "weak_validation_or_unknown"],
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
    requiredAnySignals: ["secrets_access"],
    optionalSignals: ["frontend_dom_write"],
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
    requiredAnySignals: ["frontend_dom_write"],
    optionalSignals: ["secrets_access"],
    guidance: [
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
    requiredAllSignals: ["webhook_handler"],
    optionalSignals: ["authn_missing_or_unknown"],
    guidance: [
      "Require signature verification with shared secret and timing-safe compare.",
      "Prefer replay protection when available."
    ]
  },
  {
    id: "missing_admin_mfa",
    title: "Admin endpoints do not require MFA",
    category: "authentication",
    description: "Privileged/admin actions can be performed without a second factor (MFA/2FA) or step-up authentication.",
    candidateTypes: ["missing_admin_mfa"],
    requiredAnySignals: ["authn_present", "authz_present", "public_entrypoint", "api_handler"],
    optionalSignals: ["authz_missing_or_unknown"],
    guidance: [
      "Report when an admin/privileged endpoint performs sensitive actions based only on a basic session/JWT without step-up auth (2FA/OTP/WebAuthn) and there is no verified global enforcement.",
      "Role/permission checks (e.g., auth.role === \"admin\") are NOT MFA; they satisfy authz only.",
      "Accept equivalent step-up controls (re-auth prompt + OTP, WebAuthn, device challenge, or explicit amr/acr/mfa claim checks) when clearly present.",
      "Do not report on non-admin endpoints; focus on destructive actions or admin data access (including read-only user lists).",
      "Treat paths containing /admin (or symbols named admin*) as privileged endpoints."
    ]
  },
  {
    id: "missing_webhook_config_integrity",
    title: "Missing webhook config integrity checks",
    category: "configuration",
    description: "Webhook handlers fetch or apply configuration payloads without integrity verification.",
    candidateTypes: ["missing_webhook_config_integrity"],
    requiredAllSignals: ["webhook_handler"],
    optionalSignals: ["weak_validation_or_unknown"],
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
    requiredAllSignals: ["webhook_handler"],
    optionalSignals: ["authn_present"],
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
    requiredAnySignals: ["authn_present", "secrets_access"],
    optionalSignals: ["authz_present"],
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
    requiredAnySignals: [
      "untrusted_input_present",
      "unvalidated_input",
      "weak_validation_or_unknown",
      "client_supplied_identifier"
    ],
    optionalSignals: ["public_entrypoint", "api_handler"],
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
    requiredAnySignals: ["job_worker", "secrets_access"],
    optionalSignals: ["internal_entrypoint"],
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
    requiredAnySignals: ["secrets_access"],
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
    requiredAnySignals: ["rls_reliance", "client_supplied_org_id"],
    optionalSignals: ["authz_missing_or_unknown"],
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
    requiredAnySignals: [
      "logs_sensitive",
      "frontend_dom_write",
      "template_render",
      "exec_sink"
    ],
    optionalSignals: ["untrusted_input_present", "unvalidated_input", "weak_validation_or_unknown"],
    guidance: [
      "Sanitize outputs from exec commands or user-controlled content."
    ]
  },
  {
    id: "sql_injection",
    title: "SQL injection",
    category: "injection",
    description: "Queries are built using raw SQL with user-controlled input (or raw SQL execution helpers that can be reached by untrusted input).",
    candidateTypes: ["sql_injection"],
    requiredAnySignals: ["raw_sql_sink"],
    optionalSignals: [
      "untrusted_input_present",
      "unvalidated_input",
      "weak_validation_or_unknown",
      "client_supplied_identifier",
      "id_in_path_or_query"
    ],
    guidance: [
      "Report when raw SQL strings are built with interpolated/concatenated values that can come from request parameters, headers, body, or other untrusted sources.",
      "Also report raw SQL EXECUTION HELPERS that accept an arbitrary SQL string and execute it without parameterization (e.g., client.query(sql), queryObject(sql), execute(sql)). Such helpers are high-risk because they are easily misused by callers with untrusted input.",
      "If a helper looks like a raw SQL execution wrapper (function name / signature indicates executing SQL, takes sql: string), report it even if the implementation in the chunk only logs the SQL or is a placeholder/stub. These wrappers are still dangerous patterns and are easily wired to a real driver call.",
      "Do not require proving a specific exploit; focus on the presence of a raw SQL string execution pathway or execution helper accepting caller-controlled SQL text."
    ]
  },
  {
    id: "unsafe_query_builder",
    title: "Unsafe query builder usage",
    category: "injection",
    description: "Query builder filters appear to be composed from untrusted input.",
    candidateTypes: ["unsafe_query_builder"],
    requiredAnySignals: ["orm_query_sink"],
    optionalSignals: [
      "untrusted_input_present",
      "unvalidated_input",
      "weak_validation_or_unknown",
      "client_supplied_identifier",
      "id_in_path_or_query"
    ],
    guidance: [
      "Report when a query builder accepts raw filter expressions from request input (e.g., .or(filterString), .whereRaw(expr), .filter(expr)) without strict validation/allowlisting.",
      "Be careful not to flag static, developer-authored filters that do not incorporate untrusted input."
    ]
  },
  {
    id: "command_injection",
    title: "Command injection",
    category: "injection",
    description: "Shell or exec commands are constructed from untrusted input.",
    candidateTypes: ["command_injection"],
    requiredAnySignals: ["exec_sink"],
    optionalSignals: ["untrusted_input_present", "unvalidated_input", "weak_validation_or_unknown"]
  },
  {
    id: "org_id_trust",
    title: "Trusting client-supplied org or user IDs",
    category: "access_control",
    description: "Org/user identifiers are accepted from the client without verification.",
    candidateTypes: ["org_id_trust"],
    requiredAnySignals: ["client_supplied_org_id", "client_supplied_identifier"],
    optionalSignals: ["authz_missing_or_unknown"]
  },
  {
    id: "debug_auth_leak",
    title: "Debug endpoint leaks auth context",
    category: "authentication",
    description: "Debug or logging endpoints expose auth headers or request context.",
    candidateTypes: ["debug_auth_leak"],
    requiredAnySignals: ["debug_endpoint", "logs_sensitive"],
    optionalSignals: ["authn_present"]
  },
  {
    id: "webhook_code_execution",
    title: "Webhook handler allows code execution",
    category: "authentication",
    description: "Webhook inputs are used to trigger code execution paths.",
    candidateTypes: ["webhook_code_execution"],
    requiredAllSignals: ["webhook_handler"],
    requiredAnySignals: ["exec_sink", "eval_sink"],
    optionalSignals: ["unvalidated_input"]
  },
  {
    id: "permissive_cors",
    title: "Permissive CORS configuration",
    category: "configuration",
    description: "CORS allows overly broad origins or credentials.",
    candidateTypes: ["permissive_cors"],
    requiredAnySignals: ["cors_permissive_or_unknown"]
  },
  {
    id: "jwt_validation_bypass",
    title: "JWT validation bypass",
    category: "authentication",
    description: "JWT verification can be bypassed or uses weak validation.",
    candidateTypes: ["jwt_validation_bypass"],
    requiredAnySignals: ["authn_present"],
    optionalSignals: ["secrets_access"]
  },
  {
    id: "weak_jwt_secret",
    title: "Weak JWT secret",
    category: "authentication",
    description: "JWT secrets are hardcoded, weak, or easily guessable.",
    candidateTypes: ["weak_jwt_secret"],
    requiredAnySignals: ["authn_present", "secrets_access"]
  },
  {
    id: "weak_token_generation",
    title: "Weak token generation",
    category: "authentication",
    description: "Tokens are generated using predictable or insecure methods.",
    candidateTypes: ["weak_token_generation"],
    requiredAnySignals: ["authn_present"]
  },
  {
    id: "sensitive_logging",
    title: "Sensitive data logged in plaintext",
    category: "secrets",
    description: "Sensitive data is logged without redaction.",
    candidateTypes: ["sensitive_logging"],
    requiredAnySignals: ["logs_sensitive"],
    optionalSignals: ["secrets_access"]
  },
  {
    id: "command_output_logging",
    title: "Command output logging of sensitive data",
    category: "secrets",
    description: "Command outputs containing sensitive data are logged.",
    candidateTypes: ["command_output_logging"],
    requiredAllSignals: ["exec_sink"],
    optionalSignals: ["logs_sensitive", "secrets_access"]
  },
  {
    id: "unbounded_query",
    title: "Unbounded query without pagination",
    category: "configuration",
    description: "List queries fetch all rows without limit or pagination.",
    candidateTypes: ["unbounded_query"],
    requiredAnySignals: ["orm_query_sink", "raw_sql_sink"],
    optionalSignals: ["public_entrypoint", "api_handler"],
    guidance: [
      "Report list/export handlers that return all rows without limit/range/cursor pagination.",
      "Signals include `SELECT *` without LIMIT/OFFSET or ORM queries without `.limit`, `.range`, `.page`, or cursor parameters.",
      "If the handler takes filters but never applies a cap, treat it as unbounded."
    ]
  },
  {
    id: "anon_key_bearer",
    title: "Anon key used as bearer credential",
    category: "authentication",
    description: "Public anon keys are used as bearer tokens for privileged actions.",
    candidateTypes: ["anon_key_bearer"],
    requiredAnySignals: ["authn_present", "http_request_sink"],
    optionalSignals: ["public_entrypoint"]
  },
  {
    id: "missing_bearer_token",
    title: "Missing bearer token on protected requests",
    category: "authentication",
    description: "Requests are sent without bearer tokens (or with empty/placeholder bearer tokens) for protected endpoints.",
    candidateTypes: ["missing_bearer_token"],
    requiredAnySignals: ["http_request_sink"],
    optionalSignals: ["authn_present"],
    guidance: [
      "Report when code constructs an Authorization: Bearer header from a token value that can be empty (e.g., token ?? \"\") and then proceeds with the request.",
      "This is an auth failure pattern because callers can send requests with empty or attacker-controlled tokens; servers must treat tokens as untrusted and verify them.",
      "Evidence can be: defaulting token to empty string and interpolating into `Bearer ${token}`." 
    ]
  },
  {
    id: "frontend_login_rate_limit",
    title: "Missing client-side rate limiting on login",
    category: "configuration",
    description: "Login flows lack client-side backoff or throttling signals.",
    candidateTypes: ["frontend_login_rate_limit"],
    requiredAnySignals: ["frontend_dom_write", "rate_limit_missing_or_unknown"],
    optionalSignals: ["authn_present"]
  },
  {
    id: "session_fixation",
    title: "Session fixation",
    category: "authentication",
    description: "Session identifiers are reused across authentication changes or logins.",
    requiredControls: ["secure_token_handling"],
    requiredAnySignals: ["authn_present"],
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
    requiredAnySignals: ["authn_present"],
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
    requiredAnySignals: ["authn_present", "secrets_access"],
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
    requiredControls: ["authorization:ownership_or_membership"],
    requiredAnySignals: ["mass_assignment_risk"],
    optionalSignals: ["client_supplied_identifier", "unvalidated_input"],
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
    requiredAnySignals: ["public_entrypoint", "api_handler"],
    optionalSignals: ["authz_missing_or_unknown"],
    guidance: [
      "Return DTOs/allowlisted fields instead of full ORM objects.",
      "Strip secrets and internal metadata from responses.",
      "Only report when data is exposed to untrusted/public callers; admin-only endpoints are not excessive exposure by default unless access control is missing."
    ]
  },
  {
    id: "path_traversal",
    title: "Path traversal",
    category: "injection",
    description: "User-controlled file paths access files outside allowed directories.",
    requiredControls: ["input_validation"],
    requiredAnySignals: ["file_read_sink", "file_write_sink"],
    optionalSignals: ["untrusted_input_present", "unvalidated_input", "weak_validation_or_unknown"],
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
    requiredAnySignals: ["public_entrypoint", "api_handler"],
    optionalSignals: ["weak_validation_or_unknown"],
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
    requiredAnySignals: ["file_write_sink"],
    optionalSignals: ["untrusted_input_present", "unvalidated_input", "weak_validation_or_unknown"],
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
    requiredAnySignals: ["orm_query_sink"],
    optionalSignals: ["untrusted_input_present", "unvalidated_input", "weak_validation_or_unknown"],
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
    requiredAnySignals: ["untrusted_input_present", "unvalidated_input", "weak_validation_or_unknown"],
    optionalSignals: ["authn_present"],
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
    requiredAnySignals: ["untrusted_input_present", "unvalidated_input", "weak_validation_or_unknown"],
    optionalSignals: ["template_render"],
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
    requiredAnySignals: ["template_render"],
    optionalSignals: ["untrusted_input_present", "unvalidated_input", "weak_validation_or_unknown"],
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
    requiredAnySignals: ["logs_sensitive"],
    optionalSignals: ["untrusted_input_present", "unvalidated_input", "weak_validation_or_unknown"],
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
    requiredAnySignals: ["file_write_sink"],
    optionalSignals: ["weak_validation_or_unknown"],
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
    requiredAnySignals: ["public_entrypoint", "api_handler"],
    optionalSignals: ["authn_missing_or_unknown"],
    guidance: [
      "Return generic errors to clients and log details internally.",
      "Avoid exposing stack traces, file paths, or SQL queries.",
      "Only report when errors are exposed to untrusted/public callers; admin-only endpoints are not verbose-error exposures by default unless access control is missing."
    ]
  },
  {
    id: "debug_mode_in_production",
    title: "Debug mode enabled in production",
    category: "configuration",
    description: "Debug tooling or endpoints are enabled outside development.",
    requiredControls: ["authentication"],
    requiredAnySignals: ["debug_endpoint"],
    optionalSignals: ["public_entrypoint"],
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
    requiredControls: ["authentication"],
    requiredAnySignals: ["public_entrypoint", "api_handler"],
    optionalSignals: ["authn_present"],
    guidance: [
      "Set CSP, HSTS, X-Frame-Options, and X-Content-Type-Options.",
      "Apply headers via default middleware for all responses."
    ]
  }
];
