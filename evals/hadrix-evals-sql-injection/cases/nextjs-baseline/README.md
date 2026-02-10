# Project Atlas Dashboard

A lightweight Project Atlas dashboard for PMs to filter the project roster and pull a quick detail snapshot. The Atlas page relies on the projects list API and the project detail API.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/atlas` to load the roster and drill into a project detail by id.

Example list request:
```bash
curl "http://localhost:3000/api/projects?filter=status.eq.active"
```

Example detail request:
```bash
curl "http://localhost:3000/api/projects/proj-atlas-core"
```
