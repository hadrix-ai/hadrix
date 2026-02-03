# A08 — Logging & Monitoring Coverage Scenarios (Orbit Next)

This fixture includes logging/monitoring coverage gaps typical in early-stage systems:

- Audit log events can be disabled for admin actions
- Request headers/bodies and command output written to logs
- Alerting/visibility toggles for privileged or destructive actions

## Where it exists

- Audit log toggles for admin delete:
  - `lib/audit.ts`
  - `app/api/admin/users/[id]/route.ts`
- Verbose logging:
  - `app/api/projects/route.ts`
  - `app/api/tokens/route.ts`
  - `app/api/scan/route.ts`
- Alerting toggle:
  - `lib/audit.ts`
