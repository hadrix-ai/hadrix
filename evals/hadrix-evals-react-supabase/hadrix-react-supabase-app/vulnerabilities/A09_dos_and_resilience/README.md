# A09 — DoS / Resilience Issues (Orbit Projects)

This fixture includes realistic resilience mistakes in serverless/Edge workloads:

- Unbounded queries
- No timeouts around external calls or subprocesses
- Retry storms
- Large payload handling without limits

## Where it exists

- No timeout + retry storms:
  - `backend/supabase/functions/scan-repo.ts`
- Unbounded DB queries:
  - `backend/supabase/functions/list-projects.ts`
  - `backend/supabase/functions/admin-list-users.ts`

