# A03 — Input Handling Paths (Orbit Next)

The fixture includes input-handling behaviors spanning:

- Raw SQL execution
- Query-string composition in Supabase client filters
- Shell command assembly in a repo scanning feature
- HTML content rendering from stored data

## Where it exists

- Raw SQL query concatenation:
  - `app/api/projects/[id]/route.ts`
  - `lib/runQuery.ts`
- Query builder filter passthrough:
  - `app/api/projects/route.ts` uses a client-supplied `.or()` string when enabled
- Shell command assembly:
  - `app/api/scan/route.ts`
- HTML rendering from stored content:
  - `app/projects/[id]/page.tsx` renders `description_html` via `dangerouslySetInnerHTML` when enabled
  - Seed payload in `db/seeds.sql`
