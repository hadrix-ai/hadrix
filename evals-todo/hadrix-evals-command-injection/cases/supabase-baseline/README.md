# Repo Intake Preflight

Repo Intake Preflight is a small edge-function helper that lets teams submit a Git URL and get a quick refs preview before kicking off a deeper scan.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Send a POST request to `/scan-repo` with a JSON body containing `repoUrl` (and optional intake metadata).

Example request:
```bash
curl -X POST http://localhost:54321/functions/v1/scan-repo \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"https://github.com/acme/demo.git","requestedBy":"ops@acme.test","purpose":"preflight"}'
```
