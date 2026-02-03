# A04 — Cryptography Handling Scenarios (Orbit Projects)

This fixture models crypto-handling patterns in modern apps:

- Predictable token generation paths
- Secrets stored directly in database columns
- Fallback secrets in operational flows (webhooks)
- "Magic link"/session flows that skip expiry checks

## Where it exists

- Token generation path:
  - `backend/supabase/functions/create-api-token.ts` uses `Math.random()` + timestamp
- Direct secret storage in DB:
  - `backend/supabase/migrations/001_schema.sql` (`api_tokens.token_plaintext`)
  - `backend/supabase/migrations/003_seeds.sql` includes plaintext token examples
- Webhook secret fallback:
  - `backend/supabase/functions/webhook.ts` defaults `WEBHOOK_SECRET` to `dev-secret`
