# Reliability Ops Console

A small Next.js Reliability Ops Console that lets support staff pull the admin roster, list org projects, run quick repo scans, and upload incident artifacts. The `/ops` UI calls the admin users, projects, scan, and upload API routes directly.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/ops` to load the console.

Example roster request:
```bash
curl http://localhost:3000/api/admin/users \
  -H 'authorization: Bearer demo-token' \
  -H 'x-mfa: 000000'
```

Example scan request:
```bash
curl -X POST http://localhost:3000/api/scan \
  -H 'authorization: Bearer demo-token' \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"/tmp/ops-demo-repo.git"}'
```

Example upload request:
```bash
curl -X POST http://localhost:3000/api/upload \
  -H 'content-type: text/plain' \
  --data 'incident notes: login spike from 10.0.0.0/8'
```
