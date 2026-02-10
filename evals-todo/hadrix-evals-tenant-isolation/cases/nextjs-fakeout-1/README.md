# Org Switcher Projects Console

A lightweight Next.js console where signed-in users pick an org, review the project roster, and spin up new projects. The console loads the list from the projects API and submits a server action to create new entries.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/projects` (optionally with `?orgId=org_1&userId=user_1`) to use the console.

Example project list request:
```bash
curl "http://localhost:3000/api/projects?orgId=org_1" \
  -H "authorization: Bearer demo-token"
```
