# Launch Support Console

A small Launch Support Console page used by ops to check diagnostics, status, and brand kit details during partner launches. The page links to `/api/debug` and `/api/status`, and surfaces the bucket used for brand kit assets.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/launch-support` to view the console and follow the diagnostics links.

Example status request:
```bash
curl http://localhost:3000/api/status \
  -H 'origin: https://partner.example'
```

Example debug request:
```bash
curl "http://localhost:3000/api/debug?orgId=launch-support"
```
