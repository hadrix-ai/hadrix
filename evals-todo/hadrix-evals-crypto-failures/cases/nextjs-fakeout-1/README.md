# Account Recovery Desk

A lightweight Account Recovery Desk for issuing password reset tokens when someone is locked out. The desk UI posts to `/api/password-reset` with a bearer session token and surfaces the issued reset token for follow-up.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/recovery` and submit a session token to request a reset.
3. Optionally call `/api/password-reset` directly to verify the flow.

Example reset request:
```bash
curl -X POST http://localhost:3000/api/password-reset \
  -H 'authorization: Bearer demo-token'
```
