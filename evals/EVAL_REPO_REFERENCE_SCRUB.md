# Eval Repo Reference Scrub Plan

## How to use this file (loop workflow)
- Set PLAN_FILE to use this file (default is evals/EVAL_REPO_REFERENCE_SCRUB.md).
- Checklist items must be actionable; the loop executes the first unchecked task.
- Keep each task small (1 to 3 files or one folder). Split work if it grows.
- After each step, mark the task complete and add follow-ups here.
- If paths or toggle keys change, update every reference (code, docs, specs).

## Context and goals
- Problem: eval fixtures contain explicit security/vuln labels in identifiers, comments, and docs.
  This can leak signals that make scanners key on text instead of behavior.
- Goal: remove direct callouts while preserving behavior and eval matching.
- Guardrails: do not fix or change the underlying insecure behavior; do not change
  severities, categories, or ruleIds used by evaluators.

## Scope definitions
- "Direct mention" includes words/phrases like vulnerable, insecure, unsafe, SQL injection,
  command injection, XSS, IDOR, broken access control, auth failures, etc.
- Applies to identifiers (functions/vars/classes), toggle key names, comments, UI copy,
  seed data text, and docs in each eval repo.
- File and directory names are in scope only if they are strong signals (e.g. unsafeSql),
  but avoid renaming paths unless necessary; if you do, update every reference and
  any eval specs that point at those paths.

## Per-repo checklist template
- Rename explicit identifiers and toggle keys to neutral terms; update all references.
- Remove or neutralize comments that describe insecurity/vulnerabilities.
- Scrub repo docs and expected finding descriptions to remove direct vuln labels
  while preserving semantics.

## Eval repos (worklist)

### evals-sanity-check
- [x] Scrub identifiers/comments/strings in evals/evals-sanity-check/src and package.json. (Renamed unsafeSql helper to runQuery; no package.json changes.)
- [x] Scrub evals/evals-sanity-check/README.md language. (Removed explicit vulnerability labels and "unsafe" phrasing.)

### hadrix-evals-admin-authz
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed admin_endpoint_missing_role_check to admin_endpoint_role_header.)
- [x] Scrub comments/strings in cases/. (Neutralized role warning copy in nextjs-fakeout-1 route.)
- [x] Scrub enable.md and expected_findings.json wording. (Removed direct vuln labels while keeping intent.)

### hadrix-evals-auth-failures
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed auth toggle keys to neutral labels.)
- [x] Scrub comments/strings in cases/. (Neutralized auth failure error strings in Next.js cases.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized headers and finding descriptions.)

### hadrix-evals-command-injection
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed vulnEnabled to toggleEnabled; updated toggle keys to scan_repo_shell_exec, external_call_timeout_override, extra_retry_rounds, log_scan_output, cors_any_origin.)
- [x] Scrub comments/strings in cases/. (No direct vuln callouts found in cases; only category toggle keys retained.)
- [x] Scrub enable.md and expected_findings.json wording. (Removed explicit injection labels from headings and descriptions.)

### hadrix-evals-crypto-failures
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed toggle keys + helper names; normalized token/reset storage identifiers.)
- [x] Scrub comments/strings in cases/. (No direct vuln labels found in case files.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized headings and expected finding descriptions.)

### hadrix-evals-dos-resilience
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed vulnEnabled to toggleEnabled; updated A09 toggle keys to neutral names.)
- [x] Scrub comments/strings in cases/. (No direct vuln callouts found in case files; category toggle keys retained.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized headings and descriptions; kept category keys intact.)

### hadrix-evals-frontend-authz
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed vulnEnabled to toggleEnabled; renamed frontend_only_role_enforcement to client_role_gate.)
- [x] Scrub comments/strings in cases/. (Neutralized "unsafe" copy in AdminUsers components.)
- [x] Scrub enable.md and expected_findings.json wording. (Removed direct callouts in headings and finding descriptions.)

### hadrix-evals-frontend-direct-db-write
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed vulnEnabled to toggleEnabled; updated frontend_direct_db_write to client_write_flow; renamed XSS toggle to client_html_render.)
- [x] Scrub comments/strings in cases/. (Neutralized HTML field placeholder copy.)
- [x] Scrub enable.md and expected_findings.json wording. (Updated toggle path and neutralized finding descriptions.)

### hadrix-evals-idor
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed idor_get_project to project_access_gate in config + enable.md.)
- [x] Scrub comments/strings in cases/. (Neutralized 401 error strings and membership log copy in cases/.)
- [x] Scrub enable.md and expected_findings.json wording. (Removed IDOR labels from docs and descriptions.)

### hadrix-evals-logging-monitoring
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed vulnEnabled to toggleEnabled; updated A08 toggle keys to audit_log_skip, log_extended_details, admin_action_alerts_skip, log_retention_override.)
- [x] Scrub comments/strings in cases/. (No direct vuln callouts found in case files; category toggle keys retained.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized fixture wording in enable.md and expected finding descriptions.)

### hadrix-evals-react-supabase
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Aligned toggle keys with neutral names, renamed vulnEnabled to toggleEnabled, and renamed unsafeSql helper to runQuery.)
- [x] Scrub comments/strings in frontend/, backend/, datastores/. (Neutralized UI/seed copy; kept category toggle paths unchanged.)
- [x] Scrub README/enable.md/expected_findings.json wording. (Neutralized top-level README plus category docs and expected findings; aligned advisory phrasing.)

### hadrix-evals-react-supabase-variants
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Aligned toggle keys with neutral names, renamed vulnEnabled to toggleEnabled, and renamed unsafeSql helper to runQuery with expected findings path updated.)
- [x] Scrub comments/strings in frontend/, backend/, datastores/. (Neutralized frontend UI copy; no backend/datastores changes needed.)
- [x] Scrub README/enable.md/expected_findings.json wording. (Aligned README + docs with neutral language and updated toggle keys + expected findings text.)

### hadrix-evals-rls-exposure
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed rls_permissive_policies to policy_scope_override.)
- [x] Scrub comments/strings in cases/. (Neutralized permissive policy names in rls.sql files and schema policyname.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized fixture title and finding descriptions.)

### hadrix-evals-security-misconfiguration
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed vulnEnabled to toggleEnabled; updated A02 toggle keys and enable.md references.)
- [x] Scrub comments/strings in cases/. (No direct vuln callouts found in cases/.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized fixture header/phrasing and updated expected finding descriptions.)

### hadrix-evals-software-integrity
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed vulnEnabled to toggleEnabled; aligned A07 toggle keys to webhook_signature_skip, runtime_config_exec, integrity_check_skip.)
- [x] Scrub comments/strings in cases/. (No direct vuln callouts found in cases/.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized fixture doc heading and expected finding descriptions.)

### hadrix-evals-sql-injection
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed unsafeSql helpers to runQuery, updated A03 toggle keys, and refreshed helper callsites + expected finding paths.)
- [x] Scrub comments/strings in cases/. (No direct vuln callouts found in cases/.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized direct injection/unsafe references in fixture docs and expected findings.)

### hadrix-evals-tenant-isolation
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed cross_org_leakage_trusting_org_id to org_scope_from_request.)
- [x] Scrub comments/strings in cases/. (No direct vuln callouts found in case files.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized fixture heading and finding descriptions; updated toggle path.)

### hadrix-evals-vulnerable-deps
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Updated A10 toggle keys to axios_regex_perf_case, lodash_command_exec, lodash_object_merge, jsonwebtoken_alg_mode.)
- [x] Scrub comments/strings in cases/. (Neutralized lockfile package name in dvjs-sca-baseline.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized fixture wording and expected finding descriptions.)

### hadrix-evals-xss
- [x] Rename explicit identifiers/toggles; update config + helper callsites. (Renamed vulnEnabled to toggleEnabled and xss_dangerously_set_inner_html to client_html_render.)
- [x] Scrub comments/strings in cases/. (Neutralized seed payload alert text.)
- [x] Scrub enable.md and expected_findings.json wording. (Neutralized fixture heading and expected finding descriptions; updated toggle path.)
