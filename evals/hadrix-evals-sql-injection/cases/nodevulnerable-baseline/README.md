# Support Desk Order Lookup

Support Desk Order Lookup is a small Express app that lets support agents pull recent orders for a user during ticket triage. The `/support/orders` endpoint powers the lookup flow.

**Run**
1. Create a small runner that imports `buildSupportDeskApp` from `server/app.ts` and listens on a local port.
2. Send a GET request to `/support/orders?userId=...` to fetch a user’s order list.

Example runner:
```ts
import { buildSupportDeskApp } from "./server/app.js";

const app = buildSupportDeskApp();
app.listen(3000, () => console.log("Support Desk on :3000"));
```

Example request:
```bash
curl "http://localhost:3000/support/orders?userId=user-123"
```
