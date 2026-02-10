# Webhook Replay Desk

Webhook Replay Desk is a lightweight support workflow for replaying partner webhook payloads during onboarding. It posts payloads to the `webhook` edge function and can include replay metadata plus an optional transform script used by the desk to normalize payloads.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. POST a JSON payload to `/functions/v1/webhook` with the replay metadata fields.

Example request:
```bash
curl -X POST http://localhost:54321/functions/v1/webhook \
  -H 'content-type: application/json' \
  -H 'x-webhook-signature: demo-signature' \
  -d '{"type":"invoice.paid","replayTicket":"TCK-981","replayRunId":"run-04","replayActor":"support@acme.test","transform":"payload.replayed = true; return payload;"}'
```

The response echoes `ok` plus the replay desk context so support can confirm the payload was ingested.
