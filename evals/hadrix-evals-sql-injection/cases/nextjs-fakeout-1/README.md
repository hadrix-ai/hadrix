# Project Spotlight Triage

Project Spotlight is a small ops-only view that lets support paste a project id and pull a quick detail snapshot for incident notes. The `/spotlight` page calls the project detail API under the hood.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/spotlight` and enter a project id to load the snapshot.

Example detail request:
```bash
curl "http://localhost:3000/api/projects/proj-spotlight-alpha"
```
