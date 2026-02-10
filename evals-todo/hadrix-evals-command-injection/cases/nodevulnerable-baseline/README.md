# Support Diagnostics Panel

A small Express-based support tool that lets staff ping a customer-provided host from a diagnostics panel to check connectivity during incidents.

**Run**
1. Create a runner that imports `buildSupportDiagnosticsApp` from `server/app.ts` and listens on a local port.
2. Send a GET request to `/support/diagnostics/ping` with a `host` query parameter to trigger a ping.

Example runner:
```ts
import { buildSupportDiagnosticsApp } from "./server/app.js";

const app = buildSupportDiagnosticsApp();
app.listen(3000, () => console.log("Support Diagnostics on :3000"));
```

Example request:
```bash
curl "http://localhost:3000/support/diagnostics/ping?host=127.0.0.1"
```
