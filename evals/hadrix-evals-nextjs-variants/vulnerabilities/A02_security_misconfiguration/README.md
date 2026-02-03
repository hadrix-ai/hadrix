# A02 — Configuration & Exposure (Orbit Next)

This fixture includes common configuration choices for Next.js fullstack deployments:

- Permissive CORS
- Debug endpoints enabled in production paths
- Logging tokens/headers
- Elevated key usage patterns
- Public storage bucket usage

## Where it exists

- CORS allow-all:
  - `lib/cors.ts`
- Debug response returns headers and env:
  - `app/api/debug/route.ts`
- Tokens logged:
  - `app/api/admin/users/[id]/route.ts`
- Elevated anon key usage:
  - `lib/supabase.ts`
- Public storage bucket assumption:
  - `lib/storage.ts`
- Service role key exposed:
  - `lib/env.ts`
