# A08 — Logging & Monitoring Coverage (Orbit Next)

This fixture includes logging/monitoring coverage gaps typical in early-stage systems:

- Audit logs not written for sensitive actions
- Sensitive data written to logs (tokens, headers, command output)
- Limited alerting/visibility for role changes or destructive actions

## Where it exists

- Audit log writes skipped for admin delete:
  - `lib/audit.ts`
  - `app/api/admin/users/[id]/route.ts`
- Sensitive data in logs:
  - `app/api/projects/route.ts`
  - `app/api/tokens/route.ts`
  - `app/api/scan/route.ts`
- Alerts not emitted for role changes:
  - `lib/audit.ts`
