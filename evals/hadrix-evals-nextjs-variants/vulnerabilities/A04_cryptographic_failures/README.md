# A04 — Token & Secret Handling (Orbit Next)

This fixture models common crypto tradeoffs in modern apps:

- Predictable token generation
- Secrets stored in direct database columns
- Fallback secrets in operational flows (JWTs, webhooks)
- “Magic link”/session assumptions that ignore expiry

## Where it exists

- Fallback JWT secrets:
  - `lib/auth.ts` uses fallback secrets and decodes without verification when enabled
- Basic token generation:
  - `app/api/tokens/route.ts` and `app/actions/createApiToken.ts` use `Math.random()` + timestamp
- Token material in DB:
  - `db/schema.sql` (`api_tokens.secret_payload` stores raw token material)
- Magic link expiry ignored:
  - `app/login/page.tsx`
- Webhook secret fallback:
  - `app/api/webhook/route.ts`
