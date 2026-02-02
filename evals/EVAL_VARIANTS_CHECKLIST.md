# Eval Variants Checklist (Anti-Overfitting Plan)

## How to use this file (loop workflow)
- This file is the default PLAN_FILE for loop.sh.
- Checklist items must be actionable; the loop executes the first unchecked task.
- Keep each task small (1 to 3 files or one folder). Split work if it grows.
- After each step, mark the task complete and add follow-ups here.
- Keep the mapping table and expected findings in sync with new variants.

## Context and goals
- Problem: eval heuristics can overfit to exact tokens and phrasing in fixture repos.
- Trigger: removing vulnerability callout comments exposed heuristic dependence on text-only signals.
- Goal: push detection toward structural patterns (dataflow, sinks, auth checks) instead of keyword matches.
- Scope: create paraphrased and structurally varied clones of existing vulnerabilities, not new categories.
- Guardrail: do not tune heuristics specifically to variants; variants must remain a generalization test.

## One-time setup decisions
- [x] Define target variant count per vulnerability (target: 1 per vuln; optional second only for high-signal cases).
- [x] Decide variant types to include (lexical, structural, SDK swaps).
  Decision: include lexical + structural variants; use SDK swaps only when they preserve the same vuln semantics.
- [x] Decide fixture layout (sibling fixture dirs vs. variants subfolder).
  Decision: use sibling fixture directories per suite (e.g., `hadrix-evals-nextjs-variants`).
- [x] Define eval split naming for baseline vs. generalization.
  Decision: baseline keeps the canonical spec ids (e.g., `hadrix-evals-nextjs`, `hadrix-evals-react-supabase`);
  generalization uses a `-variants` suffix for spec ids/fixture roots (e.g., `hadrix-evals-nextjs-variants`).
- [x] Create a canonical-to-variant index (table below or separate file).
- [x] Confirm expected findings update strategy and keep rule ids stable.
  Decision: `src/evals/specs/hadrixEvals/*/groups.ts` is the source of truth for eval matching;
  keep `vulnerabilities/**/expected_findings.json` in fixture repos as a human-readable mirror.
  When adding variants, update both and preserve existing `ruleId` values (RLS, OSV, static)
  for stable comparator hints; leave `ruleId` unset for heuristic-only findings.
- [x] Mirror toggles for variants in `hadrix.config.json` and `enable.md`.
- [x] Update evals README with new spec/group ids once variants exist. (Documented variant fixture naming and spec id suffixes in `evals/README.md`.)

### Canonical-to-variant index (keep updated)
| Canonical id | Variant path | Notes |
| --- | --- | --- |
| hadrix-evals-react-supabase | evals/hadrix-evals-react-supabase-variants | Sibling fixture dir for variants. |
| hadrix-evals-nextjs | evals/hadrix-evals-nextjs-variants | Sibling fixture dir for variants. |

## Per-variant rules (apply to every item below)
- Keep the same vulnerability class and severity.
- Change names, structure, and data shapes enough that shallow token matching fails.
- Preserve exploitability (no fixes or partial mitigations).
- Avoid obvious vulnerability keywords in comments or identifiers.
- Update enable docs and expected findings for every new variant location.

## React Supabase evals (hadrix-evals-react-supabase)

### A01 Broken Access Control
- [x] Create variant for IDOR in Edge Function (`backend/supabase/functions/get-project.ts`).
- [x] Create variant for cross-org leakage from trusting `orgId` (`create-project.ts`, `list-projects.ts`).
- [x] Create variant for admin endpoints missing role checks (`admin-delete-user.ts`, `admin-list-users.ts`).
- [x] Create variant for frontend-only enforcement (`frontend/admin/AdminUsers.tsx`).
- [x] Create variant for RLS misconfiguration (`backend/supabase/migrations/002_rls.sql`).

### A02 Security Misconfiguration
- [x] Create variant for CORS allow-all (`backend/supabase/functions/_shared/cors.ts`).
- [x] Create variant for debug response leaks headers/auth (`backend/supabase/functions/get-project.ts`).
- [x] Create variant for secrets logged (`backend/supabase/functions/admin-delete-user.ts`).
- [x] Create variant for over-privileged anon key usage (`frontend/utils/api.ts`).
- [x] Create variant for public operational logs via RLS (`backend/supabase/migrations/002_rls.sql`).
- [x] Mirror the audit log RLS variant in eval spec groups once variant specs are added.

### A03 Injection
- [x] Create variant for SQL injection via raw query concatenation (`get-project.ts`, `_shared/unsafeSql.ts`).
- [x] Create variant for unsafe Supabase filter injection (`list-projects.ts` with `.or(...)`).
- [x] Create variant for command injection (`backend/supabase/functions/scan-repo.ts`).
- [x] Create variant for stored XSS (`frontend/app/projects/[id]/page.tsx`, `backend/supabase/migrations/003_seeds.sql`).

### A04 Cryptographic Failures
- [x] Create variant for predictable token generation (`backend/supabase/functions/create-api-token.ts`).
- [x] Create variant for plaintext secrets in DB (`backend/supabase/migrations/001_schema.sql`, `003_seeds.sql`).
- [x] Create variant for weak fallback webhook secret (`backend/supabase/functions/webhook.ts`).

### A05 Insecure Design
- [x] Create variant for trusting client `orgId` for routing writes/reads (`create-project.ts`, `list-projects.ts`, `frontend/components/CreateProjectForm.tsx`).
- [x] Create variant for no rate limiting for sensitive actions (`create-project.ts`, `create-api-token.ts`).
- [x] Create variant for insecure membership management via RLS (`backend/supabase/migrations/002_rls.sql`).

### A06 Authentication Failures
- [x] Create variant for JWT not validated or synthetic auth context (`backend/supabase/functions/_shared/auth.ts`).
- [x] Create variant for frontend trusting its own session state (`frontend/utils/api.ts` usage).
- [x] Create variant for unlimited login attempts (`frontend/app/login/page.tsx`).

### A07 Software and Data Integrity Failures
- [x] Create variant for unsigned webhook handling (`backend/supabase/functions/webhook.ts`).
- [x] Create variant for executing user-supplied config as code (`backend/supabase/functions/webhook.ts`).

### A08 Logging and Monitoring Failures
- [x] Create variant for missing audit log for admin delete (`backend/supabase/functions/admin-delete-user.ts`). (Restructured audit write path.)
- [x] Create variant for sensitive data in logs (`create-project.ts`, `create-api-token.ts`, `scan-repo.ts`). (Verified in variants fixture.)

### A09 DoS and Resilience
- [x] Create variant for no timeout and retry storms (`backend/supabase/functions/scan-repo.ts`).
- [x] Create variant for unbounded DB queries (`list-projects.ts`, `admin-list-users.ts`).

### A10 Vulnerable Dependencies
- [x] Add variant dependency set with different vulnerable packages or versions (keep OSV-detectable).

## Next.js evals (hadrix-evals-nextjs)

### A01 Broken Access Control
- [x] Create variant for IDOR in route handler (`app/api/projects/[id]/route.ts`).
- [x] Create variant for cross-org leakage trusting `orgId` (`app/api/projects/route.ts`, `app/actions/createProject.ts`).
- [x] Create variant for admin endpoints missing role checks (`app/api/admin/users/route.ts`, `app/api/admin/users/[id]/route.ts`).
- [x] Create variant for frontend-only enforcement (`components/AdminUsers.tsx`).
- [x] Create variant for RLS misconfiguration (`db/rls.sql`).

### A02 Security Misconfiguration
- [x] Create variant for CORS allow-all (`lib/cors.ts`).
- [x] Create variant for debug response leaks headers/env (`app/api/debug/route.ts`).
- [x] Create variant for secrets logged (`app/api/admin/users/[id]/route.ts`).
- [x] Create variant for over-privileged anon key usage (`lib/supabase.ts`).
- [x] Create variant for public storage bucket assumption (`lib/storage.ts`).
- [x] Create variant for publicly exposed service role key (`lib/env.ts`).

### A03 Injection
- [x] Create variant for SQL injection via raw query concatenation (`app/api/projects/[id]/route.ts`, `lib/unsafeSql.ts`).
- [x] Create variant for unsafe Supabase filter injection (`app/api/projects/route.ts` with `.or(...)`).
- [x] Create variant for command injection (`app/api/scan/route.ts`).
- [x] Create variant for stored XSS (`app/projects/[id]/page.tsx`, `db/seeds.sql`).

### A04 Cryptographic Failures
- [x] Create variant for weak or fallback JWT secrets and decode-only auth (`lib/auth.ts`).
- [x] Create variant for predictable token generation (`app/api/tokens/route.ts`, `app/actions/createApiToken.ts`).
- [x] Create variant for plaintext secrets in DB (`db/schema.sql`).
- [x] Create variant for magic link expiry ignored (`app/login/page.tsx`).
- [x] Create variant for weak webhook secret fallback (`app/api/webhook/route.ts`).

### A05 Insecure Design
- [x] Create variant for trusting client `orgId` (`app/api/projects/route.ts`, `app/actions/createProject.ts`).
- [x] Create variant for no rate limiting on sensitive actions (`app/api/projects/route.ts`, `app/api/tokens/route.ts`, `app/actions/createApiToken.ts`).
- [x] Create variant for no tenant isolation by design (`app/dashboard/page.tsx`).
- [x] Create variant for no separation of duties (`app/api/orgs/members/route.ts`).

### A06 Authentication Failures
- [x] Create variant for JWT not validated or synthetic auth context (`lib/auth.ts`).
- [x] Create variant for frontend trusting its own session state (`app/actions/createProject.ts`).
- [x] Create variant for unlimited login attempts (`app/login/page.tsx`, `app/api/auth/login/route.ts`).
- [x] Create variant for admin functionality without MFA (`app/api/admin/users/route.ts`).

### A07 Software and Data Integrity Failures
- [x] Create variant for unsigned webhook handling (`app/api/webhook/route.ts`).
- [x] Create variant for executing user-supplied config as code (`app/api/webhook/route.ts`).
- [x] Create variant for missing integrity checks for external config payloads (`app/api/webhook/route.ts`).

### A08 Logging and Monitoring Failures
- [x] Create variant for missing audit log for admin delete (`lib/audit.ts`, `app/api/admin/users/[id]/route.ts`).
- [x] Create variant for sensitive data in logs (`app/api/projects/route.ts`, `app/api/tokens/route.ts`, `app/api/scan/route.ts`).
- [x] Create variant for no alerting for privilege escalation (`lib/audit.ts`).

### A09 DoS and Resilience
- [x] Create variant for no timeout and retry storms (`app/api/scan/route.ts`, `lib/http.ts`).
- [x] Create variant for unbounded DB queries (`app/api/projects/route.ts`, `app/api/admin/users/route.ts`).
- [x] Create variant for large payload handling without limits (`app/api/upload/route.ts`).

### A10 Vulnerable Dependencies
- [x] Add variant dependency set with different vulnerable packages or versions (keep OSV-detectable).

## Validation and bookkeeping
- [x] Verify variant toggles default to off for baseline runs. (Baseline specs only: `ALL_EVAL_SPECS` excludes `-variants` repos.)
- [x] Run the variant eval suite and record results in the evals README or a dedicated results log. (Attempted 2026-01-31; blocked by semgrep CA trust error and `better-sqlite3` Node 25 module mismatch. See `evals/README.md`.)
- [x] Re-run the variant eval suite once semgrep trust anchors and the Node/better-sqlite3 mismatch are resolved (or after switching to Node 22), then update the run log with pass/fail counts. (Attempted 2026-01-31 with Node v22.22.0 and `SSL_CERT_FILE` set; static scanners + jelly completed, but the LLM scan failed with an OpenAI connection error. See `evals/README.md`.)
- [x] Re-check DNS/egress from this environment and record status. (2026-01-31: `dns.lookup('api.openai.com')` still returns `ENOTFOUND`.)
- [ ] Restore OpenAI API connectivity for eval runs and re-run the variant eval suite to capture pass/fail counts.
  - 2026-01-31: `api.openai.com` DNS lookup fails in this environment (`ENOTFOUND` via Node `dns.lookup`); needs resolver/egress fix before retrying evals.
  - 2026-01-31: LLM scan fails with `Connection error` (cause `ENOTFOUND` resolving `api.openai.com`). See `evals/README.md` for the attempted command.
  - 2026-01-31: Re-checked DNS in this environment; `dns.lookup` and `curl` fail to resolve `api.openai.com` and even `example.com`, so evals cannot be re-run until DNS/egress is restored outside the repo.
  - 2026-01-31: Tried `dns.setServers` with `1.1.1.1` and `8.8.8.8`; `dns.lookup` still returns `ENOTFOUND`, suggesting DNS/egress is blocked beyond resolver config.
  - 2026-01-31: `dig @8.8.8.8 api.openai.com` fails with `bind: Operation not permitted`, indicating network sockets are blocked in this environment as well.
- [ ] Verify DNS/egress to `api.openai.com` (proxy or resolver config) and retry the variant eval suite once connectivity is restored.
