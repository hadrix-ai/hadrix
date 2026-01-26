# A04 — Cryptographic Failures (Orbit Next)

This fixture models common crypto mistakes in modern apps:

- Predictable token generation
- Secrets stored in plaintext database columns
- Weak/fallback secrets in operational flows (JWTs, webhooks)
- “Magic link”/session assumptions that ignore expiry

## Where it exists

- Weak/fallback JWT secrets:
  - `lib/auth.ts` uses fallback secrets and decodes without verification when enabled
- Insecure token generation:
  - `app/api/tokens/route.ts` and `app/actions/createApiToken.ts` use `Math.random()` + timestamp
- Plaintext secrets in DB:
  - `db/schema.sql` (`api_tokens.token_plaintext`)
- Magic link expiry ignored:
  - `app/login/page.tsx`
- Weak webhook secret fallback:
  - `app/api/webhook/route.ts`
