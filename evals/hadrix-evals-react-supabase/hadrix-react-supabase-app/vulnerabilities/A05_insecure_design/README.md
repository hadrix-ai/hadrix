# A05 — Design-Level Control Scenarios (Orbit Projects)

This category focuses on design-level tradeoffs that shape system behavior:

- Tenant isolation relies on client-provided identifiers
- Sensitive actions omit rate limiting by design
- No separation of duties (membership changes can be self-served)

## Where it exists

- Client orgId used to route writes/reads:
  - `backend/supabase/functions/create-project.ts`
  - `backend/supabase/functions/list-projects.ts`
  - `frontend/components/CreateProjectForm.tsx`
- Rate limiting omitted for sensitive actions:
  - `backend/supabase/functions/create-project.ts`
  - `backend/supabase/functions/create-api-token.ts`
- RLS examples for membership management:
  - `backend/supabase/migrations/002_rls.sql` contains a toggleable `org_members_insert_any` policy
