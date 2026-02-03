# A09 — Resilience & Load Handling Scenarios (Orbit Projects)

This fixture includes resilience patterns in serverless/Edge workloads:

- Queries without explicit limits
- Optional timeouts around external calls or subprocesses
- Additional retry rounds
- Large payload handling without explicit size limits

## Where it exists

- Timeout/retry configuration:
  - `backend/supabase/functions/scan-repo.ts`
- Query limit controls:
  - `backend/supabase/functions/list-projects.ts`
  - `backend/supabase/functions/admin-list-users.ts`
