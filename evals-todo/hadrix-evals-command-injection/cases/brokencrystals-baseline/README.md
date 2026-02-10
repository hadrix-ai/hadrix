# BrokenCrystals Maintenance Dispatch

A tiny Express-based ops console that lets support staff kick off maintenance jobs (cache warm, exports, audit runs) through a single dispatch endpoint backed by a local script runner.

**Run**
1. Create a small runner that imports `buildMaintenanceDispatchApp` from `server/app.ts` and listens on a local port.
2. Send a GET request to `/ops/maintenance/run` with a `task` query parameter to trigger a job.

Example runner:
```ts
import { buildMaintenanceDispatchApp } from "./server/app.js";

const app = buildMaintenanceDispatchApp();
app.listen(3000, () => console.log("Maintenance Dispatch on :3000"));
```

Example request:
```bash
curl "http://localhost:3000/ops/maintenance/run?task=backup"
```
