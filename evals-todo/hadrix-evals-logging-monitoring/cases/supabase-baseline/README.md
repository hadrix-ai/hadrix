# Security Ops Toolkit

A small set of Supabase Edge Functions used by Security Ops to offboard users, mint API tokens for automation, and run quick repository scans. The toolkit calls `admin-delete-user`, `create-api-token`, and `scan-repo` depending on the workflow.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Call the functions with ops metadata in the request body.

Example admin delete request:
```bash
curl -X POST http://localhost:54321/functions/v1/admin-delete-user \
  -H 'authorization: Bearer ops-token' \
  -H 'content-type: application/json' \
  -d '{"userId":"user-2003","reason":"abuse","ticketId":"INC-882","queue":"trust"}'
```

Example token request:
```bash
curl -X POST http://localhost:54321/functions/v1/create-api-token \
  -H 'authorization: Bearer ops-token' \
  -H 'content-type: application/json' \
  -d '{"ticketId":"INC-882","label":"scan-bot","purpose":"automation","requestedBy":"ops@acme.test"}'
```

Example scan request:
```bash
curl -X POST http://localhost:54321/functions/v1/scan-repo \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"https://git.example.com/acme/tools.git","ticketId":"INC-882","requestedBy":"ops@acme.test"}'
```
