# Session Pulse Console

A lightweight console home that uses the Session Pulse header to show who is signed in and surface quick links. The client fetches `/api/auth/session` on load and when the refresh button is clicked.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/` to see the Session Pulse header and quick links.

Example session request:
```bash
curl http://localhost:3000/api/auth/session \
  -H 'cookie: session=eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJvcHMtMTIzIiwiZW1haWwiOiJvcHNAcHVsc2UuZGV2Iiwicm9sZSI6Im1lbWJlciJ9.'
```
