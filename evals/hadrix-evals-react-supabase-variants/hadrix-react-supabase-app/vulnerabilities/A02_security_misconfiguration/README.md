# A02 — Security Misconfiguration (Orbit Projects)

This fixture includes common misconfigurations for Supabase + Edge Functions + Next.js deployments:

- Overly permissive CORS
- Debug endpoints enabled in production paths
- Logging secrets / tokens
- Over-privileged key usage patterns (anon key used like a privileged credential)
- Public data surfaces (audit logs, storage buckets)

## Where it exists

- CORS allow-all:
  - `backend/supabase/functions/_shared/cors.ts`
- Debug response leaking headers and auth context:
  - `backend/supabase/functions/get-project.ts`
- Secrets logged:
  - `backend/supabase/functions/admin-delete-user.ts`
- Over-privileged anon key usage:
  - `frontend/utils/api.ts`
- Public operational logs via RLS policy:
  - `backend/supabase/migrations/002_rls.sql` (`audit_logs_select_shared`)
