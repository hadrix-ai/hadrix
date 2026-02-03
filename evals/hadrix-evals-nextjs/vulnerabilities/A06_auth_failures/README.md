# A06 — Authentication Flow Scenarios (Orbit Next)

This fixture demonstrates authentication flow variations in Next.js fullstack apps:

- Backend can trust client state instead of validating tokens
- Route handlers can bypass JWT validation when toggled
- Login attempt controls omitted (no lockout)
- Admin functionality without step-up requirements

## Where it exists

- JWT validation optional / synthetic auth context:
  - `lib/auth.ts`
- Frontend trusts its own session state:
  - `app/actions/createProject.ts`
- Login attempt controls omitted:
  - `app/login/page.tsx`
  - `app/api/auth/login/route.ts`
- Admin functionality without step-up:
  - `app/api/admin/users/route.ts`
