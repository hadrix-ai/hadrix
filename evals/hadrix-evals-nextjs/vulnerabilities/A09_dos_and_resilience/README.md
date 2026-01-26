# A09 — DoS / Resilience Issues (Orbit Next)

This fixture includes realistic resilience mistakes in Next.js API routes:

- Unbounded queries
- No timeouts around external calls or subprocesses
- Retry storms
- Large payload handling without limits

## Where it exists

- No timeout + retry storms:
  - `app/api/scan/route.ts`
  - `lib/http.ts`
- Unbounded DB queries:
  - `app/api/projects/route.ts`
  - `app/api/admin/users/route.ts`
- Large payload handling:
  - `app/api/upload/route.ts`
