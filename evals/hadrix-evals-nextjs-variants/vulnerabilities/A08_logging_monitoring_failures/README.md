# A08 — Logging & Monitoring Failures (Orbit Next)

This fixture includes logging/monitoring failures typical in early-stage systems:

- No audit logs for sensitive actions
- Sensitive data written to logs (tokens, headers, command output)
- No alerting/visibility for privilege escalation or destructive actions

## Where it exists

- Missing audit log writes for admin delete:
  - `lib/audit.ts`
  - `app/api/admin/users/[id]/route.ts`
- Sensitive data in logs:
  - `app/api/projects/route.ts`
  - `app/api/tokens/route.ts`
  - `app/api/scan/route.ts`
- No alerting for privilege escalation:
  - `lib/audit.ts`
