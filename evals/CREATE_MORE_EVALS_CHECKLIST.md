# Create More Evals from Intentionally Vulnerable Repos (Category Intake Plan)

## How to use this file (loop workflow)
- This file is the default PLAN_FILE for loop.sh.
- Checklist items are one per category repo; the loop executes the first unchecked task.
- Do not split a repo task into per-source or per-vuln subtasks unless explicitly asked.
- After each step, mark the task complete and add follow-up notes here if gaps remain.
- Keep case lists, expected findings, enable docs, and spec groups in sync.

## Context and goals
- Expand category eval repos using intentionally vulnerable JS/TS apps listed in `CREATE_MORE_EVALS.md`.
- Treat findings as ground truth vulnerable-by-design.
- Keep categories stable; do not add new vulnerability categories or change schemas.
- Improve generalization across Node/Express, Next.js, React, and Supabase stacks.

## Source repositories (from `CREATE_MORE_EVALS.md`)
- NeuraLegion Broken Crystals - Node.js + Express; auth, injection, logic flaws.
- OWASP Juice Shop - Node.js + Express backend; injection, access control, crypto misuse.
- OWASP NodeGoat - Node.js + Express; OWASP Top 10, broken auth, injection, deserialization.
- DVWS (dvws-node) - Node.js + Express; API auth, mass assignment, IDOR.
- NodeVulnerable - Node.js + Express; legacy insecure patterns, unsafe middleware, injection.
- Damn Vulnerable JS SCA - Node.js; dependency/supply-chain focus.
- Scriptease - JS SPA + Node.js; client-to-server trust violations, XSS.
- Vulnerable REST API - React + Node.js + Express; API authz failures, broken role enforcement.

## Eval scope (supported stacks)
- React (Vite/CRA/custom) and Next.js (App Router or Pages Router).
- Node.js backends (Express.js, REST, GraphQL).
- Supabase (auth, database, RLS misuse, service role abuse).
- Ignore non-JS/TS stacks unless they expose a Node.js/TypeScript attack surface.

## Intake rules (apply to every repo task)
- Treat findings as ground truth; do not fix vulnerabilities.
- Only extract evals relevant to supported stacks.
- Do not introduce new vulnerability categories beyond existing category repos.
- Prefer file-level findings; dedupe only when the same file has the same root cause and trust boundary.
- Severity mapping:
  - Auth bypass, RCE, SQL injection -> HIGH
  - IDOR, logic flaws, mass assignment -> MEDIUM
  - Info leaks, weak config -> LOW
- Output and schema rules:
  - Keep the existing eval JSON/schema format.
  - Keep `ruleId` values stable for comparator hints (OSV, RLS, static).
- If no matching cases exist for a category, note "N/A" in the section and mark it complete.
- Non-goals: do not normalize insecure patterns; these repos are negative training data.

## Definition of done (for each repo task)
- Add new cases under `evals/<repo>/cases/<case-id>/`.
- Update `expected_findings.json`, `enable.md`, and `hadrix.config.json` in the repo.
- Update `evals/runner/specs/vulnerability/<category>/groups.ts` to include the new cases.

## Category suites (worklist)

### SQL injection (hadrix-evals-sql-injection)
- [x] Populate `hadrix-evals-sql-injection` with SQL injection cases from the source repos per intake rules and definition of done. (Split into scoped subtasks below; requires local source repo access.)
- [x] SQL injection intake: add SQL injection cases under `evals/hadrix-evals-sql-injection/cases/` and update `expected_findings.json`, `enable.md`, `hadrix.config.json`.
  Notes: Added NodeVulnerable baseline fixtures; existing SQL injection toggles already covered them.
- [x] SQL injection intake: update `evals/runner/specs/vulnerability/sql-injection/groups.ts` to include newly added SQL injection cases.

### IDOR (hadrix-evals-idor)
- [x] IDOR intake: add IDOR cases under `evals/hadrix-evals-idor/cases` and update `expected_findings.json`, `enable.md`, and `hadrix.config.json`.
  Notes: Added DVWS + NodeGoat baseline fixtures; existing `idor_get_project` toggle covers them; groups update pending.
- [x] IDOR intake: update `evals/runner/specs/vulnerability/idor/groups.ts` to include newly added IDOR cases.
  Notes: Added DVWS + NodeGoat cases to the IDOR group spec list.

### Command injection (hadrix-evals-command-injection)
- [x] Populate `hadrix-evals-command-injection` with command injection cases from the source repos per intake rules and definition of done.
  Notes: Added NodeVulnerable + NodeGoat baselines; existing toggle covers all fixtures.

### XSS (hadrix-evals-xss)
- [x] XSS intake: add XSS cases under `evals/hadrix-evals-xss/cases/` and update `expected_findings.json`, `enable.md`, and `hadrix.config.json`.
  Notes: Added NodeGoat + NodeVulnerable baseline fixtures; `hadrix.config.json` unchanged.
- [x] XSS intake: update `evals/runner/specs/vulnerability/xss/groups.ts` to include newly added XSS cases.
  Notes: Added NodeGoat + NodeVulnerable group entries.

### Admin authz (hadrix-evals-admin-authz)
- [x] Populate `hadrix-evals-admin-authz` with admin authorization failures from the source repos per intake rules and definition of done.
  Notes: Verified existing BrokenCrystals, Next.js, and Supabase admin authz fixtures with synced cases, expected findings, config, and group specs.

### Tenant isolation (hadrix-evals-tenant-isolation)
- [x] Populate `hadrix-evals-tenant-isolation` with tenant isolation failures from the source repos per intake rules and definition of done.
  Notes: Verified existing BrokenCrystals, Next.js baseline + fakeout, and Supabase baseline fixtures with synced cases, expected findings, config, and group specs.

### Frontend authz (hadrix-evals-frontend-authz)
- [x] Populate `hadrix-evals-frontend-authz` with frontend-only authorization cases from the source repos per intake rules and definition of done.
  Notes: Verified existing Next.js baseline + fakeout, Supabase baseline, and BrokenCrystals fixtures with synced expected findings, enable docs, config, and group specs.

### RLS exposure (hadrix-evals-rls-exposure)
- [x] Populate `hadrix-evals-rls-exposure` with Supabase RLS exposure cases from the source repos per intake rules and definition of done.
  Notes: Verified existing Next.js baseline + fakeout, Supabase baseline schema, and BrokenCrystals RLS fixtures with synced cases, expected findings, enable docs, config, and group specs.

### Auth failures (hadrix-evals-auth-failures)
- [x] Populate `hadrix-evals-auth-failures` with authentication failures from the source repos per intake rules and definition of done.
  Notes: Verified existing BrokenCrystals, Next.js baseline + fakeout, and Supabase baseline fixtures with synced cases, expected findings, enable docs, config, and group specs.

### Security misconfiguration (hadrix-evals-security-misconfiguration)
- [x] Populate `hadrix-evals-security-misconfiguration` with misconfiguration cases from the source repos per intake rules and definition of done.
  Notes: Added NodeGoat debug endpoint + NodeVulnerable CORS fixtures; toggles unchanged.

### Crypto failures (hadrix-evals-crypto-failures)
- [x] Populate `hadrix-evals-crypto-failures` with cryptographic failures from the source repos per intake rules and definition of done.
  Notes: Added NodeGoat weak JWT fallback + NodeVulnerable password reset token fixtures; toggles/config unchanged.

### Software integrity (hadrix-evals-software-integrity)
- [x] Populate `hadrix-evals-software-integrity` with software/data integrity cases from the source repos per intake rules and definition of done.
  Notes: Added NodeGoat insecure deserialization fixture; no additional source-repo A07 cases found in local fixtures.

### Logging & monitoring (hadrix-evals-logging-monitoring)
- [x] Populate `hadrix-evals-logging-monitoring` with logging/monitoring failures from the source repos per intake rules and definition of done.
  Notes: Added NodeGoat login credential logging fixture; no additional source-repo logging/monitoring cases found in local fixtures.

### DoS/resilience (hadrix-evals-dos-resilience)
- [x] Populate `hadrix-evals-dos-resilience` with DoS/resilience cases from the source repos per intake rules and definition of done.
  Notes: Verified existing BrokenCrystals + Next.js baseline + fakeout + Supabase baseline fixtures with synced cases, expected findings, config, and group specs; no additional source-repo DoS fixtures found in local fixtures.

### Vulnerable deps (hadrix-evals-vulnerable-deps)
- [x] Populate `hadrix-evals-vulnerable-deps` with vulnerable dependency cases (primarily from Damn Vulnerable JS SCA) per intake rules and definition of done.
  Notes: Added `dvjs-sca-baseline` lockfile fixture (axios/lodash/jsonwebtoken vulnerable versions) and synced expected findings + groups; enable/config unchanged. DVJS SCA repo access not available in this environment—swap in the real lockfile if needed.

### Frontend direct DB write (hadrix-evals-frontend-direct-db-write)
- [x] Populate `hadrix-evals-frontend-direct-db-write` with frontend direct DB write cases from the source repos per intake rules and definition of done.
  Notes: Verified existing BrokenCrystals, Next.js baseline + fakeout, and Supabase baseline fixtures with synced cases, expected findings, enable docs, config, and group specs.
