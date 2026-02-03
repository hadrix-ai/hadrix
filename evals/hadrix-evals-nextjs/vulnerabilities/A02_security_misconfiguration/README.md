# A02 — Deployment Configuration Scenarios (Orbit Next)

This fixture includes configuration patterns common in Next.js fullstack deployments:

- Broad CORS settings
- Debug endpoints enabled on production paths
- Header/env logging
- Admin-capable key usage patterns
- Public storage bucket usage

## Where it exists

- CORS allow-all configuration:
  - `lib/cors.ts`
- Debug response includes headers and environment values:
  - `app/api/debug/route.ts`
- Request headers logged:
  - `app/api/admin/users/[id]/route.ts`
- Admin-capable anon key usage:
  - `lib/supabase.ts`
- Public storage bucket assumption:
  - `lib/storage.ts`
- Service role key placed in `NEXT_PUBLIC` env var:
  - `lib/env.ts`
