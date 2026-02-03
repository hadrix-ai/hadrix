# A03 — Query & Execution Composition (Orbit Projects)

The fixture includes input-composition paths spanning:

- Raw SQL execution
- String-based filter composition in Supabase client queries
- Shell command composition in a repo scanning feature
- HTML content rendering from stored data

## Where it exists

- Raw SQL string concatenation:
  - `backend/supabase/functions/get-project.ts`
  - `backend/supabase/functions/_shared/runQuery.ts`
- Query builder filter composition:
  - `backend/supabase/functions/list-projects.ts` uses a client-supplied `.or()` string when enabled
- Shell command composition:
  - `backend/supabase/functions/scan-repo.ts`
- HTML rendering from stored content:
  - `frontend/app/projects/[id]/page.tsx` renders `description_html` via `dangerouslySetInnerHTML` when enabled
  - Seed payload in `backend/supabase/migrations/003_seeds.sql`
