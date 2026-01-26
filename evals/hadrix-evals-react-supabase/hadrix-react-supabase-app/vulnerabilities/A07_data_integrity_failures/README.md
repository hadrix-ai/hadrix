# A07 — Software & Data Integrity Failures (Orbit Projects)

This fixture models integrity failures that commonly appear in webhook and automation pipelines:

- Unsigned webhooks accepted
- Execution of user-supplied “transform” logic
- Missing integrity checks around external data ingestion

## Where it exists

- Unsigned webhook handling:
  - `backend/supabase/functions/webhook.ts` can skip signature validation when enabled
- Executing user-supplied config as code:
  - `backend/supabase/functions/webhook.ts` uses `new Function(...)` when enabled

