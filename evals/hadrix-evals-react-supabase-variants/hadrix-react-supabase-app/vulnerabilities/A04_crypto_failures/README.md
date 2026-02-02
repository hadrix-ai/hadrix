# A04 — Cryptographic Failures (Orbit Projects)

This fixture models common crypto mistakes in modern apps:

- Predictable token generation
- Secrets stored in plaintext database columns
- Weak/fallback secrets in operational flows (webhooks)
- “Magic link”/session assumptions that ignore expiry (modeled at the app layer)

## Where it exists

- Insecure token generation:
  - `backend/supabase/functions/create-api-token.ts` uses `Math.random()` + timestamp
- Plaintext secrets in DB:
  - `backend/supabase/migrations/001_schema.sql` (`api_tokens.secret_payload` stores raw secret material)
  - `backend/supabase/migrations/003_seeds.sql` includes plaintext key examples
- Weak fallback secrets:
  - `backend/supabase/functions/webhook.ts` defaults `WEBHOOK_SECRET` to `dev-secret`
