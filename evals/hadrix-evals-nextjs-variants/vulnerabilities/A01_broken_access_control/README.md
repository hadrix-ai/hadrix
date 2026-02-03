# A01 — Access Control Scenarios (Orbit Next)

This app is multi-tenant (organizations → projects). The fixture includes multiple **access-control gaps** across:

- Next.js route handlers (project lookup without membership checks)
- Server actions that trust client-provided identifiers
- Frontend-only role gating
- Database RLS configuration (SQL fixture)

## Where it exists

- Project lookup without membership checks:
  - `app/api/projects/[id]/route.ts` fetches a project by `id` without verifying tenant membership when enabled.
- Cross-org access via client-provided org IDs:
  - `app/api/projects/route.ts` and `app/actions/createProject.ts` trust `orgId` from the client.
- Admin endpoints with role checks skipped:
  - `app/api/admin/users/route.ts`
  - `app/api/admin/users/[id]/route.ts`
- Frontend-only enforcement:
  - `components/AdminUsers.tsx` hides admin UI based on localStorage role.
- RLS configuration:
  - `db/rls.sql` contains permissive policies with allow-all predicates.
