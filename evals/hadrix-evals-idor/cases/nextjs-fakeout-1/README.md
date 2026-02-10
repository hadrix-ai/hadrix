# Project Triage Snapshot

A lightweight Project Triage Snapshot page for on-call support to pull a project summary by ID from incident tickets. The `/triage/[id]` page calls `/api/projects/:id` and renders the snapshot card.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/triage/proj-123` or call the API route directly with a bearer token.

Example request:
```bash
curl http://localhost:3000/api/projects/proj-123 \
  -H 'authorization: Bearer demo-token'
```
