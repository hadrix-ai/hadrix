# Signal Desk

Signal Desk is a lightweight status feed for on-call staff. The home page calls the `signal-desk-feed` edge function to load updates for a channel, and the `/login` page provides a simple sign-in form for the demo.

**Run**
1. Serve the edge functions from `backend/supabase/functions` (for example, `supabase functions serve`).
2. Start a Next.js dev server with this case mounted as the app directory and set `NEXT_PUBLIC_FUNCTIONS_BASE_URL` to your local functions URL.
3. Visit `/login` to sign in, then `/` to see the Signal Desk feed.

Example feed request:
```bash
curl -X POST http://localhost:54321/functions/v1/signal-desk-feed \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer demo-token' \
  -d '{"channel":"ops"}'
```
