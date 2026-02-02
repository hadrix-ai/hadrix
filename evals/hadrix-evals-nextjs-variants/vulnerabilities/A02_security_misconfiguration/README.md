# A02 — Security Misconfiguration (Orbit Next)

This fixture includes common misconfigurations for Next.js fullstack deployments:

- Overly permissive CORS
- Debug endpoints enabled in production paths
- Logging secrets / tokens
- Over-privileged key usage patterns
- Public storage bucket usage

## Where it exists

- CORS allow-all:
  - `lib/cors.ts`
- Debug response leaking headers and env:
  - `app/api/debug/route.ts`
- Secrets logged:
  - `app/api/admin/users/[id]/route.ts`
- Over-privileged anon key usage:
  - `lib/supabase.ts`
- Public storage bucket assumption:
  - `lib/storage.ts`
- Publicly exposed service role key:
  - `lib/env.ts`
