# A01 — Access & Scoping Scenarios (Orbit Next)

This app is multi-tenant (organizations → projects). The fixture includes multiple access and scoping scenarios across:

- Next.js route handlers (tenant membership gate controlled by toggle)
- Server actions that source identifiers from the client
- Client-side role gating
- Database RLS policy fixture (SQL)

## Where it exists

- Route handler project lookup:
  - `app/api/projects/[id]/route.ts` fetches a project by `id`; tenant membership gate is toggle-controlled.
- Org scoping via client identifiers:
  - `app/api/projects/route.ts` and `app/actions/createProject.ts` use client-supplied `orgId` when enabled.
- Admin endpoints role gate:
  - `app/api/admin/users/route.ts`
  - `app/api/admin/users/[id]/route.ts`
- Client-side role gate:
  - `components/AdminUsers.tsx` hides admin UI based on localStorage role.
- RLS policy fixture:
  - `db/rls.sql` includes permissive policies (e.g., `using (true)`).
