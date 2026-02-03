# A08 — Logging & Monitoring Coverage Scenarios (Orbit Projects)

This fixture includes logging/monitoring coverage gaps typical in early-stage systems:

- Audit log events can be disabled for admin actions
- Request bodies, tokens, and command output written to logs
- Alerting/visibility toggles for privileged or destructive actions

## Where it exists

- Audit log toggle for admin delete:
  - `backend/supabase/functions/admin-delete-user.ts` conditionally skips audit logging
- Verbose logging:
  - `backend/supabase/functions/create-project.ts`
  - `backend/supabase/functions/create-api-token.ts`
  - `backend/supabase/functions/scan-repo.ts`
