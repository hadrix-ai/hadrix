# Trust Desk Functions

A pair of Supabase Edge Functions used by the Trust Desk moderation queue to load the latest user roster and remove abusive accounts. The roster view hits `admin-list-users`, and the remove action calls `admin-delete-user` with ticket metadata.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Call the functions with an `Authorization` header to load the roster or remove a user.

Example list request:
```bash
curl http://localhost:54321/functions/v1/admin-list-users \
  -H 'authorization: Bearer demo-token' \
  -H 'x-ops-queue: trust'
```

Example delete request:
```bash
curl -X POST http://localhost:54321/functions/v1/admin-delete-user \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -d '{"userId":"user-1002","reason":"abuse","ticketId":"TCK-2048"}'
```
