# A07 — Integrity & Automation Flow Scenarios (Orbit Next)

This fixture models automation pipeline behaviors that affect data integrity:

- Webhook signature validation optional
- Execution of user-supplied transform logic
- External data ingestion without integrity checks

## Where it exists

- Webhook signature validation toggle:
  - `app/api/webhook/route.ts` can skip signature verification when enabled
- Executing user-supplied config as code:
  - `app/api/webhook/route.ts` uses `new Function(...)` when enabled
- External config ingestion without verification:
  - `app/api/webhook/route.ts` fetches config URLs without verification
