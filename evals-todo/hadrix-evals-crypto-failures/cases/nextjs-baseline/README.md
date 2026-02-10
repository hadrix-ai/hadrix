# Developer Access Console

A small Next.js console for issuing integration tokens and previewing the API token endpoint before handing it to partners. The page uses a server action for manual issuance and can call the `/api/tokens` route to exercise the HTTP flow.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/console` and submit the form to mint a token for a user.
3. Use the “Endpoint Preview” panel to call `/api/tokens` with a bearer token.

Example API request:
```bash
curl -X POST http://localhost:3000/api/tokens \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -d '{"label":"billing-sync"}'
```
