# A01 — Broken Access Control (Orbit Next)

This app is multi-tenant (organizations → projects). The fixture includes multiple **realistic access-control failures** across:

- Next.js route handlers (missing authorization checks / IDOR)
- Server actions that trust client-provided identifiers
- Frontend-only role gating
- Database RLS misconfiguration (SQL fixture)

## Where it exists

- IDOR in route handler:
  - `app/api/projects/[id]/route.ts` fetches a project by `id` without verifying tenant membership when enabled.
- Cross-org leakage / trusting org IDs:
  - `app/api/projects/route.ts` and `app/actions/createProject.ts` trust `orgId` from the client.
- Admin endpoints missing role checks:
  - `app/api/admin/users/route.ts`
  - `app/api/admin/users/[id]/route.ts`
- Frontend-only enforcement:
  - `components/AdminUsers.tsx` hides admin UI based on localStorage role.
- RLS misconfiguration:
  - `db/rls.sql` contains permissive policies with allow-all predicates.
