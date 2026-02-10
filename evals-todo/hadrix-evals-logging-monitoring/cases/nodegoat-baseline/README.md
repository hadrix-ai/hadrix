# GoatDesk Support Portal

A tiny Express-based support portal that lets agents sign in to open the ticket queue. The portal mounts a single login route that accepts credentials and returns a basic success response.

**Run**
1. Create a small runner that imports `buildGoatDeskSupportPortalApp` from `server/app.ts` and listens on a local port.
2. Send a POST request to `/support/login` with JSON credentials to simulate a support agent login.

Example runner:
```ts
import { buildGoatDeskSupportPortalApp } from "./server/app.js";

const app = buildGoatDeskSupportPortalApp();
app.listen(3000, () => console.log("GoatDesk Support Portal on :3000"));
```

Example request:
```bash
curl -X POST http://localhost:3000/support/login \
  -H 'content-type: application/json' \
  -d '{"username":"agent.sage","password":"GoatDeskR0cks!"}'
```
