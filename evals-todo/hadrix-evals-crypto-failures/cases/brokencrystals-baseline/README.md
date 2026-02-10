# BrokenCrystals Session + API Key Hub

A small Express-based hub for support operators to mint short-lived support sessions and issue API tokens for integrations. It keeps a lightweight in-memory token store and exposes two JSON endpoints for the support console workflow.

**Run**
1. Create a tiny runner that imports `buildSessionHubApp` from `server/app.ts` and listens on a local port.
2. Send a POST to `/support/sessions` with JSON like `{ "userId": "u_123", "actorId": "ops_1", "reason": "account recovery" }`.
3. Send a POST to `/support/tokens` with JSON like `{ "userId": "u_123", "label": "billing-sync" }`.

Example runner:
```ts
import { buildSessionHubApp } from "./server/app.js";

const app = buildSessionHubApp();
app.listen(3000, () => console.log("Session Hub on :3000"));
```

Example requests:
```bash
curl -X POST http://localhost:3000/support/sessions \
  -H 'content-type: application/json' \
  -d '{"userId":"u_123","actorId":"ops_1","reason":"account recovery"}'

curl -X POST http://localhost:3000/support/tokens \
  -H 'content-type: application/json' \
  -d '{"userId":"u_123","label":"billing-sync"}'
```
