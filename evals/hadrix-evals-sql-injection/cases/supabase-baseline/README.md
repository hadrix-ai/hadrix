# Portfolio Ops Snapshot

Portfolio Ops Snapshot is a small ops helper that lets support staff pull a single project record and a filtered roster during incident triage. It exposes the `get-project` and `list-projects` Supabase Edge functions.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Send POST requests to the functions with a Bearer token.

Example requests:
```bash
curl -X POST http://localhost:54321/functions/v1/get-project \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -d '{"id":"project_1","snapshotId":"snap-ops-001","requestedBy":"ops@portfolio.example"}'
```

```bash
curl -X POST http://localhost:54321/functions/v1/list-projects \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -d '{"or":"name.ilike.*roadmap*","queue":"ops","view":"snapshot"}'
```
