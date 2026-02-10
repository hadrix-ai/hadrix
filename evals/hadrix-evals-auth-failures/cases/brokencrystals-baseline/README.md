# CrystalDesk Incident Inbox

An Express-based incident inbox that support agents use to pull incident details and internal notes during live response. The app serves a lightweight in-memory roster and exposes a single incident detail route.

**Run**
1. Create a small runner that imports `buildIncidentInboxApp` from `server/app.ts` and listens on a local port.
2. Send a request to `/incidents/:id` with a Bearer token to fetch the incident payload.

Example runner:
```ts
import { buildIncidentInboxApp } from "./server/app.js";

const app = buildIncidentInboxApp();
app.listen(3000, () => console.log("Incident Inbox on :3000"));
```

Example request:
```bash
curl http://localhost:3000/incidents/INC-2401 \
  -H 'authorization: Bearer demo-token'
```
