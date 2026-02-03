# A09 — Resilience & Load Handling Scenarios (Orbit Next)

This fixture includes resilience patterns in Next.js API routes:

- Queries without explicit limits
- Optional timeouts around external calls or subprocesses
- Additional retry rounds
- Large payload handling without explicit size limits

## Where it exists

- Timeout/retry configuration:
  - `app/api/scan/route.ts`
  - `lib/http.ts`
- Query limit controls:
  - `app/api/projects/route.ts`
  - `app/api/admin/users/route.ts`
- Payload handling:
  - `app/api/upload/route.ts`
