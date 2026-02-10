# Project Intake Desk Functions

A pair of Supabase Edge Functions used by the Project Intake Desk to file new projects for an org and review the org roster. The intake UI calls `create-project` to open a new project entry and `list-projects` to load the current roster while attaching ticket metadata.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Call the functions with an `Authorization` header to mimic a signed-in support agent.

Example list request:
```bash
curl -X POST http://localhost:54321/functions/v1/list-projects \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -H 'x-intake-queue: project-intake' \
  -H 'x-intake-ticket: TCK-4102' \
  -d '{"orgId":"org_1"}'
```

Example create request:
```bash
curl -X POST http://localhost:54321/functions/v1/create-project \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -H 'x-intake-queue: project-intake' \
  -H 'x-intake-ticket: TCK-4102' \
  -d '{"orgId":"org_1","name":"Bridge Rewrite","description":"Data layer refresh"}'
```
