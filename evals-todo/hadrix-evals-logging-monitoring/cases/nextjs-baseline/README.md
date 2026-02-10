# Launchpad Ops Console

A small Launchpad Ops Console for on-call staff to create projects, run quick repo scans, issue API tokens, and remove users. The `/launchpad` page calls the admin/user/project/scan endpoints directly for quick ops workflows.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/launchpad` to use the console, or call the APIs directly.

Example create-project request:
```bash
curl -X POST http://localhost:3000/api/projects \
  -H 'authorization: Bearer demo-token' \
  -H 'content-type: application/json' \
  -d '{"name":"Ops Console","description":"Internal tools","descriptionHtml":"<p>Internal tools</p>"}'
```

Example repo scan request:
```bash
curl -X POST http://localhost:3000/api/scan \
  -H 'content-type: application/json' \
  -d '{"repoUrl":"https://github.com/org/repo.git"}'
```

Example token request:
```bash
curl -X POST http://localhost:3000/api/tokens \
  -H 'authorization: Bearer demo-token'
```

Example admin delete request:
```bash
curl -X DELETE http://localhost:3000/api/admin/users/123 \
  -H 'authorization: Bearer demo-token'
```
