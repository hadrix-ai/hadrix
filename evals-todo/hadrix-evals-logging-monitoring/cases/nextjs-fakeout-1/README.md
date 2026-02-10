# Integration Key Desk

A lightweight Integration Key Desk for support staff to issue API tokens for partner tooling. The `/integration-keys` page calls the token issuance API directly for quick handoffs.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/integration-keys` to use the desk, or call the API directly.

Example token request:
```bash
curl -X POST http://localhost:3000/api/tokens \
  -H 'x-user-id: user_123' \
  -H 'content-type: application/json'
```
