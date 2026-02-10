# Release Readiness Desk

A small Release Readiness Desk flow for Supabase edge functions. Ops staff can pull the current project roster for their org and run a quick repo preflight check before a maintenance window. The `list-projects` function returns the roster plus desk metadata, and `scan-repo` runs a git `ls-remote` against a repo URL.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Call the `list-projects` and `scan-repo` functions with the desk headers/body.

Example roster request:
```bash
curl http://localhost:54321/functions/v1/list-projects \
  -H 'authorization: Bearer demo-token' \
  -H 'x-release-ticket: REL-2041' \
  -H 'x-release-run: rr-17' \
  -H 'x-ops-handle: ops@orbit.dev'
```

Example scan request:
```bash
curl -X POST http://localhost:54321/functions/v1/scan-repo \
  -H 'content-type: application/json' \
  -H 'x-release-ticket: REL-2041' \
  -H 'x-release-run: rr-17' \
  -H 'x-ops-handle: ops@orbit.dev' \
  -d '{"repoUrl":"/tmp/release-demo-repo.git","depth":1,"ticketId":"REL-2041","runId":"rr-17","requestedBy":"ops@orbit.dev"}'
```
