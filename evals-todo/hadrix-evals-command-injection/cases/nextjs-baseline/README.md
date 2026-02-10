# Repo Intake Preflight

A lightweight Repo Intake Preflight form that lets operators paste a Git URL, run a quick connectivity check, and show the latest refs before scheduling a deeper scan.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/` to submit a repo URL and view the preflight output.

Example request:
```bash
curl -X POST http://localhost:3000/api/scan \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"https://github.com/acme/ops-demo.git"}'
```
