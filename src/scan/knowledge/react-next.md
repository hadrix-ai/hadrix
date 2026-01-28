# React/Next.js security cues (condensed)

This is a lightweight, curated knowledge context injected into the LLM scan prompt.
It is intentionally short to reduce token cost and avoid hallucination.

Focus areas for Next.js/React repos:
- Treat `app/**/route.ts` and `pages/api/**` handlers as public endpoints unless proven otherwise.
- Prefer server-side authorization checks (role/ownership/tenant) over frontend-only gating.
- Watch for unsafe redirects (`redirect`, `NextResponse.redirect`) using user-controlled URLs.
- Watch for XSS primitives (`dangerouslySetInnerHTML`) and untrusted HTML rendering.
- Watch for SSRF (`fetch(userUrl)`), especially in API/edge handlers.
- Watch for permissive CORS and missing security headers on API responses.
- Validate and bound list endpoints (pagination/limits) to prevent unbounded queries.
- Add rate limiting / lockout on auth/token issuance and other sensitive actions.
