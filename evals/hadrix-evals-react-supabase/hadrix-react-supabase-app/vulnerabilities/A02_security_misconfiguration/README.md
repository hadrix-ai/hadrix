# A02 — Deployment Configuration Scenarios (Orbit Projects)

This fixture includes configuration patterns common in Supabase + Edge Functions + Next.js deployments:

- Broad CORS settings
- Debug endpoints enabled in production paths
- Header/context logging
- Admin-capable key usage patterns (anon key used like a privileged credential)
- Public data surfaces (webhook event logs, storage buckets)

## Where it exists

- CORS allow-all configuration:
  - `backend/supabase/functions/_shared/cors.ts`
- Debug response includes headers and request context:
  - `backend/supabase/functions/get-project.ts`
- Request headers logged:
  - `backend/supabase/functions/admin-delete-user.ts`
- Admin-capable anon key usage:
  - `frontend/utils/api.ts`
- Public operational logs via RLS policy:
  - `backend/supabase/migrations/002_rls.sql` (`webhook_events_select_public`)
