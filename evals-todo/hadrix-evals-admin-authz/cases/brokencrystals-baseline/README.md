# BrokenCrystals Ops Console

A tiny Express-based ops console used during incident response to quickly toggle admin status on user accounts. The app keeps a lightweight in-memory roster and exposes a single admin role endpoint.

**Run**
1. Create a small runner that imports `buildOpsConsoleApp` from `server/app.ts` and listens on a local port.
2. Send a PATCH request to `/admin/users/:id` with JSON like `{ "isAdmin": true }` to update a user's role.

Example runner:
```ts
import { buildOpsConsoleApp } from "./server/app.js";

const app = buildOpsConsoleApp();
app.listen(3000, () => console.log("Ops Console on :3000"));
```

Example request:
```bash
curl -X PATCH http://localhost:3000/admin/users/123 \
  -H 'content-type: application/json' \
  -d '{"isAdmin":true}'
```
