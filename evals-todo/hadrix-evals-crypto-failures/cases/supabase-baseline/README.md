# Token Desk

A small support flow for issuing and tracking partner API tokens. The Token Desk edge function issues a token and echoes basic request metadata so the support queue can log who requested it and why.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Call the `create-api-token` function with an `Authorization` header and optional Token Desk metadata.

Example request:
```bash
curl -X POST http://localhost:54321/functions/v1/create-api-token \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -H 'x-token-desk-ticket: TCK-556' \
  -H 'x-token-desk-partner: orbit' \
  -H 'x-token-desk-requested-by: support@orbit.dev' \
  -d '{"reason":"partner onboarding","partnerSlug":"orbit"}'
```
