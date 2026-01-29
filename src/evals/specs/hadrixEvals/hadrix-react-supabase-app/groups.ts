import type { EvalGroupSpec } from "../../../types.js";
const P = "hadrix-react-supabase-app";

export const ORBIT_PROJECTS_GROUPS: EvalGroupSpec[] = [
  {
    id: "Orbit-Projects-A01",
    description: "A01 Broken Access Control in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/get-project.ts`,
        expectation: "IDOR: project fetched by ID without verifying org membership/ownership.",
      },
      {
        filepath: `${P}/backend/supabase/functions/admin-delete-user.ts`,
        expectation: "Admin endpoint allows destructive action without a server-side role check.",
      },
      {
        filepath: `${P}/frontend/admin/AdminUsers.tsx`,
        expectation: "Frontend-only admin enforcement based on client metadata/claims.",
      },
    ],
  },
  {
    id: "Orbit-Projects-A02",
    description: "A02 Security Misconfiguration in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/_shared/cors.ts`,
        expectation: "Overly permissive CORS configuration allows any origin.",
      },
      {
        filepath: `${P}/backend/supabase/functions/get-project.ts`,
        expectation: "Debug endpoint leaks auth context and request headers.",
      },
      {
        filepath: `${P}/frontend/utils/api.ts`,
        expectation: "Misuse of Supabase anon key as a privileged bearer token.",
      },
    ],
  },
  {
    id: "Orbit-Projects-A03",
    description: "A03 Injection in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/get-project.ts`,
        expectation: "SQL injection via raw SQL string concatenation.",
      },
      {
        filepath: `${P}/backend/supabase/functions/scan-repo.ts`,
        expectation: "Command injection risk from user-controlled repoUrl used in a shell command.",
      },
      {
        filepath: `${P}/frontend/app/projects/[id]/page.tsx`,
        expectation: "Stored XSS: dangerouslySetInnerHTML renders user-controlled HTML from the database.",
      },
      {
        filepath: `${P}/backend/supabase/functions/list-projects.ts`,
        expectation: "Unsafe query builder usage: user-controlled filter string passed into query composition.",
      },
    ],
  },
  {
    id: "Orbit-Projects-A04",
    description: "A04 Cryptographic Failures in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/create-api-token.ts`,
        expectation: "Insecure token generation uses Math.random or other low-entropy sources.",
      },
      {
        filepath: `${P}/backend/supabase/functions/_shared/auth.ts`,
        expectation: "Weak/fallback JWT secret usage or unsafe token parsing without validation.",
      },
    ],
  },
  {
    id: "Orbit-Projects-A05",
    description: "A05 Insecure Design in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/create-project.ts`,
        expectation: "Trusting client-provided orgId for tenant routing enables cross-tenant actions.",
      },
      {
        filepath: `${P}/backend/supabase/functions/create-api-token.ts`,
        expectation: "No rate limiting on sensitive actions (token issuance).",
      },
    ],
  },
  {
    id: "Orbit-Projects-A06",
    description: "A06 Authentication Failures in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/_shared/auth.ts`,
        expectation: "JWT validation bypass or trusting presence of Authorization header as authentication.",
      },
      {
        filepath: `${P}/frontend/utils/api.ts`,
        expectation: "Backend trusts frontend auth state / uses missing or wrong bearer tokens.",
      },
    ],
  },
  {
    id: "Orbit-Projects-A07",
    description: "A07 Software & Data Integrity Failures in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/webhook.ts`,
        expectation: "Unsigned webhooks accepted or signature validation missing/optional.",
      },
      {
        filepath: `${P}/backend/supabase/functions/webhook.ts`,
        expectation: "User-supplied config executed as code (e.g. new Function) leading to integrity failure.",
      },
    ],
  },
  {
    id: "Orbit-Projects-A08",
    description: "A08 Logging & Monitoring Failures in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/admin-delete-user.ts`,
        expectation: "No audit log recorded for destructive admin action (or audit logging skipped).",
      },
      {
        filepath: `${P}/backend/supabase/functions/create-api-token.ts`,
        expectation: "Sensitive data (plaintext tokens/secrets) written to logs.",
      },
      {
        filepath: `${P}/backend/supabase/functions/scan-repo.ts`,
        expectation: "Sensitive command output or URLs logged without scrubbing.",
      },
    ],
  },
  {
    id: "Orbit-Projects-A09",
    description: "A09 DoS / Resilience in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/scan-repo.ts`,
        expectation: "No timeout on external calls/subprocesses and retry storms on failure.",
      },
      {
        filepath: `${P}/backend/supabase/functions/list-projects.ts`,
        expectation: "Unbounded database queries (missing limits) can cause resource exhaustion.",
      },
    ],
  },
  {
    id: "Orbit-Projects-DB-Write-Gating",
    description: "Frontend DB writes should be gated behind edge/API + RLS in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/frontend/components/CreateProjectForm.tsx`,
        expectation:
          "Frontend performs direct Supabase writes without server/edge gating; enforce RLS and move writes behind edge/API functions.",
        ruleId: "frontend_direct_db_write",
      },
    ],
  },
  {
    id: "Orbit-Projects-Supabase-DB",
    description: "Supabase schema exposure checks in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/datastores/supabase/mock/schema.json`,
        expectation: "public.test_no_rls: RLS disabled.",
        ruleId: "supabase_rls_disabled",
      },
      {
        filepath: `${P}/datastores/supabase/mock/schema.json`,
        expectation: "public.test_rls_no_policy: RLS enabled but no policies.",
        ruleId: "supabase_rls_no_policies",
      },
      {
        filepath: `${P}/datastores/supabase/mock/schema.json`,
        expectation: "Table public.projects is writable by client roles (anon).",
        ruleId: "supabase_client_write_access",
      },
      {
        filepath: `${P}/datastores/supabase/mock/schema.json`,
        expectation: "Table public.projects is writable by client roles without column-level ACLs.",
        ruleId: "supabase_column_acl_missing",
      },
      {
        filepath: `${P}/datastores/supabase/mock/schema.json`,
        expectation: "Function public.add_credits.add_credits_1 is executable by public.",
        ruleId: "supabase_function_public_exec",
      },
      {
        filepath: `${P}/datastores/supabase/mock/schema.json`,
        expectation: "Storage bucket avatars is public.",
        ruleId: "supabase_public_bucket",
      },
      {
        filepath: `${P}/datastores/supabase/mock/schema.json`,
        expectation: "storage.objects policy allows public access.",
        ruleId: "supabase_storage_objects_public_policy",
      },
    ],
  },
  {
    id: "Orbit-Projects-A10",
    description: "A10 Vulnerable and Outdated Components in hadrix-react-supabase-app",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/package-lock.json`,
        expectation: "axios@0.21.1 - 4 known vulnerabilities (HIGH:2, MEDIUM:2)",
        ruleId: "osv:axios@0.21.1",
      },
      {
        filepath: `${P}/package-lock.json`,
        expectation: "lodash@4.17.20 - 2 known vulnerabilities (HIGH:1, MEDIUM:1)",
        ruleId: "osv:lodash@4.17.20",
      },
      {
        filepath: `${P}/package-lock.json`,
        expectation: "jsonwebtoken@8.5.1 - 3 known vulnerabilities (HIGH:1, MEDIUM:2)",
        ruleId: "osv:jsonwebtoken@8.5.1",
      },
    ],
  },

  {
    id: "Orbit-Projects-Sampler-LongFiles",
    description: "Sampler: long file hot-spans coverage",
    allowUnexpected: true,
    expectedFindings: [
      {
        filepath: `${P}/backend/supabase/functions/fixtures/long_hot_begin.ts`,
        expectation: "Use of eval with user input.",
      },
      {
        filepath: `${P}/backend/supabase/functions/fixtures/long_hot_middle.ts`,
        expectation: "Use of new Function with user input.",
      },
      {
        filepath: `${P}/backend/supabase/functions/fixtures/long_hot_end.ts`,
        expectation: "Command execution via child_process/exec.",
      },
    ],
  },
];
