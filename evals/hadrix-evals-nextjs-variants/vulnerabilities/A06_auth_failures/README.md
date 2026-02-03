# A06 — Authentication Flow Scenarios (Orbit Next)

This fixture demonstrates authentication flow gaps typical in Next.js fullstack apps:

- Backend trusts client state instead of validating tokens
- Route handlers can skip JWT validation when toggled
- Login attempts are not limited
- Admin actions do not require MFA

## Where it exists

- JWT not validated / synthetic session context:
  - `lib/auth.ts`
- Frontend trusts its own session state:
  - `app/actions/createProject.ts`
- Login attempts not limited:
  - `app/login/page.tsx`
  - `app/api/auth/login/route.ts`
- Admin actions without MFA:
  - `app/api/admin/users/route.ts`
