# Support Triage Roster

A compact Support Triage page for ops staff to load the full user roster during incident response. The UI calls the admin users API and lets staff supply the session token, role header, and MFA hint used for triage checks.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/triage` to load the roster and review the user list.

Example list request:
```bash
curl http://localhost:3000/api/admin/users \
  -H 'authorization: Bearer demo-token' \
  -H 'x-user-role: admin' \
  -H 'x-mfa: 000000'
```
