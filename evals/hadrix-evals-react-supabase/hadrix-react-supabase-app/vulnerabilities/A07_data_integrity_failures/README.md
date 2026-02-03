# A07 — Integrity & Automation Flow Scenarios (Orbit Projects)

This fixture models automation pipeline behaviors that affect data integrity:

- Webhook signature validation optional
- Execution of user-supplied transform logic
- External data ingestion with optional verification

## Where it exists

- Webhook signature validation toggle:
  - `backend/supabase/functions/webhook.ts` can skip signature verification when enabled
- Executing user-supplied config as code:
  - `backend/supabase/functions/webhook.ts` uses `new Function(...)` when enabled
