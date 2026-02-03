# A07 — Software & Data Integrity Paths (Orbit Next)

This fixture models integrity gaps that commonly appear in webhook and automation pipelines:

- Webhook requests accepted without signatures
- Execution of user-supplied “transform” logic
- Integrity checks skipped around external data ingestion

## Where it exists

- Webhook signature checks skipped:
  - `app/api/webhook/route.ts` can skip signature validation when enabled
- Executing user-supplied config as code:
  - `app/api/webhook/route.ts` uses `new Function(...)` when enabled
- Integrity checks skipped for external config payloads:
  - `app/api/webhook/route.ts` fetches config URLs without verification
