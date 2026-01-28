# Supabase/Postgres security cues (condensed)

Curated, short knowledge context injected into the LLM scan prompt.

Focus areas for Supabase repos:
- Never use the anon key as a privileged bearer credential.
- Treat JWT presence as insufficient; require proper verification/claims and avoid weak defaults.
- Enforce RLS for client-writeable tables and avoid relying on RLS alone for sensitive writes (prefer server/edge gating too).
- Webhooks must verify signatures and ideally enforce replay protection (timestamp/nonce).
- Avoid logging secrets/tokens or returning raw payloads/error details in responses.
- Prefer parameterized queries / safe query builders; avoid string concatenation in SQL.
