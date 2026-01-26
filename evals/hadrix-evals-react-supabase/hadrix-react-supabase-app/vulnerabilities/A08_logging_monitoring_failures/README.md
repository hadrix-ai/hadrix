# A08 — Logging & Monitoring Failures (Orbit Projects)

This fixture includes logging/monitoring failures typical in early-stage systems:

- No audit logs for sensitive actions
- Sensitive data written to logs (tokens, headers, command output)
- No alerting/visibility for privilege escalation or destructive actions

## Where it exists

- Missing audit log writes for admin delete:
  - `backend/supabase/functions/admin-delete-user.ts` conditionally skips audit logging
- Sensitive data in logs:
  - `backend/supabase/functions/create-project.ts`
  - `backend/supabase/functions/create-api-token.ts`
  - `backend/supabase/functions/scan-repo.ts`

