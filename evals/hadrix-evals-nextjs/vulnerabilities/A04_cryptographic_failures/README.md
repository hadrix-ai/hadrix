# A04 — Cryptography Handling Scenarios (Orbit Next)

This fixture models crypto-handling patterns in modern apps:

- Predictable token generation paths
- Secrets stored directly in database columns
- Fallback secrets in operational flows (JWTs, webhooks)
- "Magic link"/session flows that skip expiry checks

## Where it exists

- JWT secret fallback:
  - `lib/auth.ts` uses fallback secrets and can decode without verification when enabled
- Token generation path:
  - `app/api/tokens/route.ts` and `app/actions/createApiToken.ts` use `Math.random()` + timestamp
- Direct secret storage in DB:
  - `db/schema.sql` (`api_tokens.token_plaintext`)
- Magic link expiry handling:
  - `app/login/page.tsx`
- Webhook secret fallback:
  - `app/api/webhook/route.ts`
