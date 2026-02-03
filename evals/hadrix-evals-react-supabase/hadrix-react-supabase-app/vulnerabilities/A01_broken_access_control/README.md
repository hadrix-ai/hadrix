# A01 — Access & Scoping Scenarios (Orbit Projects)

This app is multi-tenant (organizations → projects). The fixture includes access and scoping scenarios across:

- Database (RLS policy fixtures)
- Supabase Edge Functions (tenant membership gates controlled by toggles)
- Frontend (client-side role gating)

## Why this is realistic

Modern SaaS apps often mix:

- Postgres RLS
- "service role" Edge Functions
- frontend role gating

That combination creates multiple decision points across the stack.

## Where it exists

- Project lookup gate in Edge Function:
  - `backend/supabase/functions/get-project.ts` fetches a project by `id`; tenant membership gate is toggle-controlled.
- Org scoping via client identifiers:
  - `backend/supabase/functions/create-project.ts` and `backend/supabase/functions/list-projects.ts` use client-supplied `orgId` when enabled.
- Admin endpoints role gate:
  - `backend/supabase/functions/admin-delete-user.ts`
  - `backend/supabase/functions/admin-list-users.ts`
- Client-side role gate:
  - `frontend/admin/AdminUsers.tsx` hides admin UI based on client claims.
- RLS policy fixture:
  - `backend/supabase/migrations/002_rls.sql` includes permissive policies (e.g., `using (true)`).
