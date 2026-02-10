# Project Snapshot Embed

A lightweight Project Snapshot Embed that can be dropped into partner dashboards to pull a single project's details. The embed page at `/embed/projects/[id]` calls the `get-project` edge function to fetch the snapshot data it renders.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Start the frontend in `frontend` and visit `/embed/projects/<id>`.

Example function request:
```bash
curl -X POST http://localhost:54321/functions/v1/get-project \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -d '{"id":"proj_123"}'
```
