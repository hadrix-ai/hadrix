# A07 — Software & Data Integrity Failures (Orbit Next)

This fixture models integrity failures that commonly appear in webhook and automation pipelines:

- Unsigned webhooks accepted
- Execution of user-supplied “transform” logic
- Missing integrity checks around external data ingestion

## Where it exists

- Unsigned webhook handling:
  - `app/api/webhook/route.ts` can skip signature validation when enabled
- Executing user-supplied config as code:
  - `app/api/webhook/route.ts` uses `new Function(...)` when enabled
- Missing integrity checks for external config payloads:
  - `app/api/webhook/route.ts` fetches config URLs without verification
