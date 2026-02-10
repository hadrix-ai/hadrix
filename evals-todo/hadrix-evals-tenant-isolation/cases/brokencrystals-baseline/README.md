# BrokenCrystals Fulfillment Desk

A tiny Express-based fulfillment desk used during incident triage to pull recent orders for a given org ID. The desk keeps a lightweight in-memory context and exposes a single lookup endpoint for ops staff.

**Run**
1. Create a small runner that imports `buildFulfillmentDeskApp` from `server/app.ts` and listens on a local port.
2. Send a POST request to `/fulfillment/orders` with JSON like `{ "orgId": "tenant_1" }` to fetch recent orders.

Example runner:
```ts
import { buildFulfillmentDeskApp } from "./server/app.js";

const app = buildFulfillmentDeskApp();
app.listen(3000, () => console.log("Fulfillment Desk on :3000"));
```

Example request:
```bash
curl -X POST http://localhost:3000/fulfillment/orders \
  -H 'content-type: application/json' \
  -d '{"orgId":"tenant_1"}'
```
