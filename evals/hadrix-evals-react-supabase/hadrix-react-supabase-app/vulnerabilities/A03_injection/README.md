# A03 — Injection (Orbit Projects)

The fixture includes injection issues spanning:

- Raw SQL execution
- Unsafe PostgREST query-string composition
- Command injection in a repo scanning feature
- Stored XSS from HTML content rendering

## Where it exists

- SQL injection (raw query concatenation):
  - `backend/supabase/functions/get-project.ts`
  - `backend/supabase/functions/_shared/unsafeSql.ts`
- Unsafe query builder filter injection:
  - `backend/supabase/functions/list-projects.ts` uses a client-supplied `.or()` string when enabled
- Command injection:
  - `backend/supabase/functions/scan-repo.ts`
- Stored XSS:
  - `frontend/app/projects/[id]/page.tsx` renders `description_html` via `dangerouslySetInnerHTML` when enabled
  - Seed payload in `backend/supabase/migrations/003_seeds.sql`

