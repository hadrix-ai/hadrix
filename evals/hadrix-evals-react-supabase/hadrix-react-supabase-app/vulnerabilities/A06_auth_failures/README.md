# A06 — Authentication Flow Scenarios (Orbit Projects)

This fixture demonstrates authentication flow variations in SPAs + serverless backends:

- Backend can trust client state instead of validating tokens
- Edge Functions can skip JWT validation when toggled
- Login attempt controls omitted (no lockout)
- Admin functionality without step-up requirements

## Where it exists

- JWT validation optional / synthetic auth context:
  - `backend/supabase/functions/_shared/auth.ts`
- Frontend trusts its own session state:
  - `frontend/utils/api.ts` and usage across pages
- Login attempt controls omitted:
  - `frontend/app/login/page.tsx`
