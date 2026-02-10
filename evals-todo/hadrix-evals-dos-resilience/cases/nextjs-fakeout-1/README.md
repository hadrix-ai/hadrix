# Partner Status Pulse

A tiny Next.js Partner Status Pulse page that lets ops quickly check a partner status feed. The root route (`/`) fetches a status snapshot from the fixed partner URL and renders the response preview.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/` to view the pulse.

Example request:
```bash
curl http://localhost:3000/
```
