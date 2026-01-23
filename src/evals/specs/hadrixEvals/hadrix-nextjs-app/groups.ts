import type { EvalGroupSpec } from "../../../types.js";
import { DATASTORE_RLS_EVAL_GROUP } from "../hadrix-react-supabase-app/rls.js";
export const ORBIT_NEXT_GROUPS: EvalGroupSpec[] = [
  {
    id: "Orbit-Next-A01",
    description: "A01 Broken Access Control in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "app/api/projects/[id]/route.ts",
        expectation: "IDOR: project fetched by ID without ownership check when toggle is enabled",
        severity: "high",
      },
      {
        filepath: "app/api/projects/route.ts",
        expectation: "Cross-tenant leakage: client-controlled orgId used for filtering and writes",
        severity: "high",
      },
      {
        filepath: "app/actions/createProject.ts",
        expectation: "Server action trusts client orgId for project creation",
        severity: "high",
      },
      {
        filepath: "app/api/admin/users/route.ts",
        expectation: "Admin list endpoint missing role checks",
        severity: "critical",
      },
      {
        filepath: "app/api/admin/users/[id]/route.ts",
        expectation: "Admin delete endpoint missing role checks",
        severity: "critical",
      },
      {
        filepath: "components/AdminUsers.tsx",
        expectation: "Frontend-only role enforcement based on client-side state",
        severity: "medium",
      },
    ],
  },
  {
    id: "Orbit-Next-A02",
    description: "A02 Security Misconfiguration in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "lib/cors.ts",
        expectation: "CORS allow-all configuration",
        severity: "medium",
      },
      {
        filepath: "app/api/debug/route.ts",
        expectation: "Debug endpoint returns headers and environment secrets",
        severity: "high",
      },
      {
        filepath: "app/api/admin/users/[id]/route.ts",
        expectation: "Sensitive authorization headers logged",
        severity: "medium",
      },
      {
        filepath: "lib/supabase.ts",
        expectation: "Over-privileged key usage (anon key used as admin)",
        severity: "high",
      },
      {
        filepath: "lib/storage.ts",
        expectation: "Public storage bucket configured without access control",
        severity: "medium",
      },
      {
        filepath: "lib/env.ts",
        expectation: "Service role key exposed via NEXT_PUBLIC environment variable",
        severity: "high",
      },
    ],
  },
  {
    id: "Orbit-Next-A03",
    description: "A03 Injection in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "app/api/projects/[id]/route.ts",
        expectation:
          "SQL injection: raw SQL built by concatenating the project id into a query string",
        severity: "critical",
      },
      {
        filepath: "lib/unsafeSql.ts",
        expectation: "Unsafe raw SQL execution helper used by Next.js route handlers",
        severity: "high",
      },
      {
        filepath: "app/api/projects/route.ts",
        expectation:
          "Unsafe query-builder usage: user-controlled `.or()` filter string passed to Supabase query builder",
        severity: "high",
      },
      {
        filepath: "app/api/scan/route.ts",
        expectation: "Command injection: repoUrl concatenated into shell command when toggle enabled",
        severity: "critical",
      },
      {
        filepath: "app/projects/[id]/page.tsx",
        expectation:
          "Stored XSS: dangerouslySetInnerHTML renders project.description_html from DB",
        severity: "high",
      },
    ],
  },
  {
    id: "Orbit-Next-A04",
    description: "A04 Cryptographic Failures in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "lib/auth.ts",
        expectation: "Weak/fallback JWT secret and decoding without verification",
        severity: "high",
      },
      {
        filepath: "app/api/tokens/route.ts",
        expectation: "Insecure random token generation and plaintext token storage",
        severity: "high",
      },
      {
        filepath: "app/actions/createApiToken.ts",
        expectation: "Insecure random token generation in server action",
        severity: "medium",
      },
      {
        filepath: "db/schema.sql",
        expectation: "Plaintext token column in database schema",
        severity: "medium",
      },
      {
        filepath: "app/login/page.tsx",
        expectation: "Magic link accepted without expiration validation",
        severity: "medium",
      },
      {
        filepath: "app/api/webhook/route.ts",
        expectation: "Webhook signature verification uses weak/fallback secret",
        severity: "medium",
      },
    ],
  },
  {
    id: "Orbit-Next-A05",
    description: "A05 Insecure Design in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "app/api/projects/route.ts",
        expectation: "No rate limiting and client-controlled orgId for project creation",
        severity: "medium",
      },
      {
        filepath: "app/actions/createProject.ts",
        expectation: "Server action trusts client orgId and lacks rate limiting",
        severity: "medium",
      },
      {
        filepath: "app/api/tokens/route.ts",
        expectation: "API token creation lacks rate limiting",
        severity: "medium",
      },
      {
        filepath: "app/actions/createApiToken.ts",
        expectation: "Server action creates API tokens without rate limiting",
        severity: "low",
      },
      {
        filepath: "app/dashboard/page.tsx",
        expectation: "No tenant isolation by design (all orgs visible)",
        severity: "medium",
      },
      {
        filepath: "app/api/orgs/members/route.ts",
        expectation: "No separation of duties: any user can add members to any org",
        severity: "high",
      },
    ],
  },
  {
    id: "Orbit-Next-A06",
    description: "A06 Authentication Failures in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "lib/auth.ts",
        expectation: "JWT validation skipped or downgraded to header presence",
        severity: "high",
      },
      {
        filepath: "app/actions/createProject.ts",
        expectation: "Server action trusts client-provided userId",
        severity: "medium",
      },
      {
        filepath: "app/login/page.tsx",
        expectation: "Unlimited login attempts without lockout",
        severity: "medium",
      },
      {
        filepath: "app/api/auth/login/route.ts",
        expectation: "Login API lacks rate limiting",
        severity: "medium",
      },
      {
        filepath: "app/api/admin/users/route.ts",
        expectation: "Admin endpoints do not require MFA",
        severity: "high",
      },
    ],
  },
  {
    id: "Orbit-Next-A07",
    description: "A07 Software & Data Integrity Failures in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "app/api/webhook/route.ts",
        expectation: "Unsigned webhooks accepted and signature verification can be skipped",
        severity: "high",
      },
      {
        filepath: "app/api/webhook/route.ts",
        expectation: "User-supplied transform logic executed with new Function",
        severity: "high",
      },
      {
        filepath: "app/api/webhook/route.ts",
        expectation: "External config fetched without integrity checks",
        severity: "medium",
      },
    ],
  },
  {
    id: "Orbit-Next-A08",
    description: "A08 Logging & Monitoring Failures in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "lib/audit.ts",
        expectation: "Audit logging and alerts can be disabled for sensitive actions",
        severity: "high",
      },
      {
        filepath: "app/api/projects/route.ts",
        expectation: "Sensitive request bodies logged",
        severity: "medium",
      },
      {
        filepath: "app/api/tokens/route.ts",
        expectation: "Plaintext API tokens logged",
        severity: "high",
      },
      {
        filepath: "app/api/scan/route.ts",
        expectation: "Command output logged without redaction",
        severity: "medium",
      },
      {
        filepath: "app/api/admin/users/[id]/route.ts",
        expectation: "Admin deletes lack audit log enforcement",
        severity: "high",
      },
    ],
  },
  {
    id: "Orbit-Next-A09",
    description: "A09 DoS / Resilience in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "lib/http.ts",
        expectation: "Outbound requests made without timeouts",
        severity: "medium",
      },
      {
        filepath: "app/api/scan/route.ts",
        expectation: "No timeout and retry storms around repo scan",
        severity: "high",
      },
      {
        filepath: "app/api/projects/route.ts",
        expectation: "Unbounded project list queries",
        severity: "medium",
      },
      {
        filepath: "app/api/admin/users/route.ts",
        expectation: "Unbounded admin user list queries",
        severity: "medium",
      },
      {
        filepath: "app/api/upload/route.ts",
        expectation: "Large payloads accepted without size limits",
        severity: "medium",
      },
    ],
  },
  {
    id: "Orbit-Next-A10",
    description: "A10 Vulnerable and Outdated Components in hadrix-evals-nextjs",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: "package-lock.json",
        expectation:
          "axios@0.21.1: Inefficient Regular Expression Complexity (ReDoS) in trim function",
        severity: "high",
        ruleId: "GHSA-cph5-m8f7-6c5x",
      },
      {
        filepath: "package-lock.json",
        expectation: "lodash@4.17.20: Command Injection via template function",
        severity: "high",
        ruleId: "GHSA-35jh-r3h4-6jhm",
      },
      {
        filepath: "package-lock.json",
        expectation: "lodash@4.17.20: Regular Expression Denial of Service (ReDoS)",
        severity: "medium",
        ruleId: "GHSA-p6mc-m468-83gw",
      },
      {
        filepath: "package-lock.json",
        expectation: "lodash@4.17.20: Prototype Pollution in zipObjectDeep",
        severity: "high",
        ruleId: "GHSA-4xc9-xhrj-v574",
      },
      {
        filepath: "package-lock.json",
        expectation:
          "jsonwebtoken@8.5.1: Unrestricted key type could lead to signature validation bypass",
        severity: "high",
        ruleId: "GHSA-hjrf-2m68-5959",
      },
      {
        filepath: "package-lock.json",
        expectation:
          "jsonwebtoken@8.5.1: Algorithm confusion when using asymmetric keys",
        severity: "medium",
        ruleId: "GHSA-c7hr-j4mj-j2w6",
      },
    ],
  },
  DATASTORE_RLS_EVAL_GROUP,
];
