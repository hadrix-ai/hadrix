# Project Brief

A lightweight Project Brief page for support staff to pull a project summary by ID while reviewing tickets. The `/projects/[id]` page calls `/api/projects/:id` and renders the summary card.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/projects/proj-123` or call the API route directly with a bearer token.

Example request:
```bash
curl http://localhost:3000/api/projects/proj-123 \
  -H 'authorization: Bearer demo-token'
```
