# A01 — Broken Access Control (Orbit Projects)

This app is multi-tenant (organizations → projects). The fixture includes multiple **realistic access-control failures** across:

- Database (RLS)
- Supabase Edge Functions (missing authorization checks / IDOR)
- Frontend (role checks performed only in the UI)

## Why this is realistic

Modern SaaS apps often mix:

- Postgres RLS
- “service role” Edge Functions
- frontend role gating

This creates common failure modes: **IDOR**, **cross-tenant leakage**, and **admin actions without authorization**.

## Where it exists

- IDOR in Edge Function:
  - `backend/supabase/functions/get-project.ts` fetches a project by `id` without verifying tenant membership when the toggle is enabled.
- Cross-org leakage / trusting org IDs:
  - `backend/supabase/functions/create-project.ts` and `backend/supabase/functions/list-projects.ts` trust `orgId` from the client.
- Admin endpoints missing role checks:
  - `backend/supabase/functions/admin-delete-user.ts`
  - `backend/supabase/functions/admin-list-users.ts`
- Frontend-only enforcement:
  - `frontend/admin/AdminUsers.tsx` hides admin UI based on client claims, not server authorization.
- RLS misconfiguration:
  - `backend/supabase/migrations/002_rls.sql` contains toggleable permissive policies (e.g., `using (true)`).

