# A09 — Resilience & Load Handling (Orbit Next)

This fixture includes realistic resilience tradeoffs in Next.js API routes:

- Unbounded queries
- No timeouts around external calls or subprocesses
- Repeated retries
- Large payload handling without limits

## Where it exists

- No timeouts + repeated retries:
  - `app/api/scan/route.ts`
  - `lib/http.ts`
- Unbounded DB queries:
  - `app/api/projects/route.ts`
  - `app/api/admin/users/route.ts`
- Large payload handling:
  - `app/api/upload/route.ts`
