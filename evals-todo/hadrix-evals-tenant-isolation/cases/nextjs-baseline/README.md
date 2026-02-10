# Workspace Projects Hub

A lightweight Next.js hub where signed-in users pick an org, create a project, and browse the project roster. The hub submits a create form via a server action and pulls the list from the projects API.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/projects` to open the hub and submit the create form.

Example project list request:
```bash
curl "http://localhost:3000/api/projects?orgId=org_1" \
  -H "authorization: Bearer demo-token"
```
