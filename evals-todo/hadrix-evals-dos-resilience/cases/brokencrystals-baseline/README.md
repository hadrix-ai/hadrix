# BrokenCrystals Ops Export

A tiny Express-based ops export app for pulling full order histories during reconciliation. It exposes a single export route that returns all orders for an org id.

**Run**
1. Create a small runner that imports `buildOpsExportApp` from `server/app.ts` and listens on a local port.
2. Send a GET request to `/ops/export?orgId=...` to fetch the export payload.

Example runner:
```ts
import { buildOpsExportApp } from "./server/app.js";

const app = buildOpsExportApp();
app.listen(3000, () => console.log("Ops Export on :3000"));
```

Example request:
```bash
curl "http://localhost:3000/ops/export?orgId=acme"
```
