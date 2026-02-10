# Partner Repo Intake

A lightweight Partner Repo Intake page that lets ops paste an approved Git URL, run a quick connectivity preflight, and preview refs before adding the repo to the scan queue.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/` to submit a repo URL and view the preflight output.

Example request:
```bash
curl -X POST http://localhost:3000/api/scan \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"https://github.com/org/partner-repo.git"}'
```
