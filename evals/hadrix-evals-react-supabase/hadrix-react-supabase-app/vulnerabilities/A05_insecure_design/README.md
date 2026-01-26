# A05 — Insecure Design (Orbit Projects)

This category focuses on design-level weaknesses that lead to systemic issues:

- Tenant isolation relies on client-provided identifiers
- Sensitive actions lack rate limiting by design
- No separation of duties (e.g., membership changes can be self-served)

## Where it exists

- Trust client orgId to route writes/reads:
  - `backend/supabase/functions/create-project.ts`
  - `backend/supabase/functions/list-projects.ts`
  - `frontend/components/CreateProjectForm.tsx`
- No rate limiting on sensitive actions:
  - `backend/supabase/functions/create-project.ts`
  - `backend/supabase/functions/create-api-token.ts`
- RLS examples demonstrating insecure membership management:
  - `backend/supabase/migrations/002_rls.sql` contains a toggleable `org_members_insert_any` policy

