# Project Pulse Lookup

Project Pulse is a lightweight Trust Desk lookup that lets support staff paste a project ID from a ticket and get a summary response. The `get-project` edge function powers the lookup and returns project details plus the pulse metadata.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Call the `get-project` function with a project id and pulse metadata.

Example request:
```bash
curl -X POST http://localhost:54321/functions/v1/get-project \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -d '{"projectId":"proj-123","pulse":{"ticketId":"INC-44","queue":"trust","requestedBy":"ops"}}'
```
