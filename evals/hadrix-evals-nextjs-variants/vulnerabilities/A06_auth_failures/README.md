# A06 — Authentication Failures (Orbit Next)

This fixture demonstrates auth failures typical in Next.js fullstack apps:

- Backend trusts client state instead of validating tokens
- Route handlers skip JWT validation when toggled
- Unlimited login attempts (no lockout)
- Admin functionality without MFA requirements

## Where it exists

- JWT not validated / synthetic auth context:
  - `lib/auth.ts`
- Frontend trusts its own session state:
  - `app/actions/createProject.ts`
- Unlimited login attempts:
  - `app/login/page.tsx`
  - `app/api/auth/login/route.ts`
- Admin functionality without MFA:
  - `app/api/admin/users/route.ts`
