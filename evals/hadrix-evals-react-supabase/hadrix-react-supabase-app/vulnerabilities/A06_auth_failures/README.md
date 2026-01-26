# A06 — Authentication Failures (Orbit Projects)

This fixture demonstrates auth failures typical in SPAs + serverless backends:

- Backend trusts client state instead of validating tokens
- Edge Functions skip JWT validation when toggled
- Unlimited login attempts (no lockout)
- Admin functionality without MFA requirements

## Where it exists

- JWT not validated / synthetic auth context:
  - `backend/supabase/functions/_shared/auth.ts`
- Frontend trusts its own session state:
  - `frontend/utils/api.ts` and usage across pages
- Unlimited login attempts:
  - `frontend/app/login/page.tsx`

