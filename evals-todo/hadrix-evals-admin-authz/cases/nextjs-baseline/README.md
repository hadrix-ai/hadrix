# Support Console

A lightweight Support Console page for ops staff to review the user roster and issue quick removals when handling abuse reports. The UI pulls data from the admin list route and uses the admin delete route for removals.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/support` to load the roster and send delete requests from the console.

Example list request:
```bash
curl http://localhost:3000/api/admin/users \
  -H 'authorization: Bearer demo-token' \
  -H 'x-mfa: 000000'
```

Example delete request:
```bash
curl -X DELETE http://localhost:3000/api/admin/users/123 \
  -H 'authorization: Bearer demo-token'
```
