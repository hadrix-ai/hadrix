export type RuleScanDefinition = {
  id: string;
  title: string;
  category: string;
  description: string;
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
    id: "missing_role_check",
    title: "Missing role checks on admin endpoint",
    category: "access_control",
    description: "Admin handlers lack server-side role or permission enforcement.",
    requiredControls: ["authorization:role"],
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
    guidance: [
      "Frontend code should not embed private keys, service secrets, or admin tokens."
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
      "Policies should constrain access by tenant or owner context."
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
  }
];
