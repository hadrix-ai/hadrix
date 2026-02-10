# BrokenCrystals Partner Token Concierge

A small Express-based ops helper that lets support staff issue onboarding tokens for partner integrations. The concierge endpoint accepts a token value and returns it for copy/paste into partner dashboards.

**Run**
1. Create a small runner that imports `buildPartnerTokenConciergeApp` from `server/app.ts` and listens on a local port.
2. Send a POST request to `/ops/partner-tokens/issue` with a JSON body containing `token`.

Example runner:
```ts
import { buildPartnerTokenConciergeApp } from "./server/app.js";

const app = buildPartnerTokenConciergeApp();
app.listen(3000, () => console.log("Partner Token Concierge on :3000"));
```

Example request:
```bash
curl -X POST "http://localhost:3000/ops/partner-tokens/issue" \
  -H "Content-Type: application/json" \
  -d '{"token":"sk_live_12345"}'
```
