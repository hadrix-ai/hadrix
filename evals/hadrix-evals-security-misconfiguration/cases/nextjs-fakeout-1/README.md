# Status Beacon

A small Status Beacon preview used by support to verify the embed wiring. The page links to `/api/status` and echoes a request id so partners can confirm the widget is live.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/status-beacon` to view the preview and follow the status link.

Example status request:
```bash
curl http://localhost:3000/api/status \
  -H 'origin: https://partner.example' \
  -H 'x-request-id: beacon-123'
```
