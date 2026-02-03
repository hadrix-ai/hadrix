# A03 — Query & Execution Composition (Orbit Next)

The fixture includes input-composition paths spanning:

- Raw SQL execution
- String-based filter composition in Supabase client queries
- Shell command composition in a repo scanning feature
- HTML content rendering from stored data

## Where it exists

- Raw SQL string concatenation:
  - `app/api/projects/[id]/route.ts`
  - `lib/runQuery.ts`
- Query builder filter composition:
  - `app/api/projects/route.ts` uses a client-supplied `.or()` string when enabled
- Shell command composition:
  - `app/api/scan/route.ts`
- HTML rendering from stored content:
  - `app/projects/[id]/page.tsx` renders `description_html` via `dangerouslySetInnerHTML` when enabled
  - Seed payload in `db/seeds.sql`
