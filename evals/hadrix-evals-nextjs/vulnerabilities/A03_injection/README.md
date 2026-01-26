# A03 — Injection (Orbit Next)

The fixture includes injection issues spanning:

- Raw SQL execution
- Unsafe query-string composition in Supabase client filters
- Command injection in a repo scanning feature
- Stored XSS from HTML content rendering

## Where it exists

- SQL injection (raw query concatenation):
  - `app/api/projects/[id]/route.ts`
  - `lib/unsafeSql.ts`
- Unsafe query builder filter injection:
  - `app/api/projects/route.ts` uses a client-supplied `.or()` string when enabled
- Command injection:
  - `app/api/scan/route.ts`
- Stored XSS:
  - `app/projects/[id]/page.tsx` renders `description_html` via `dangerouslySetInnerHTML` when enabled
  - Seed payload in `db/seeds.sql`
