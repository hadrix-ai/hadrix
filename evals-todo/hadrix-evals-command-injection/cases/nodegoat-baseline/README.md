# Ops Backup Snapshot

A small Express-based ops helper that lets support staff trigger a one-off MongoDB dump for a named database and capture the output for incident review.

**Run**
1. Create a runner that imports `buildBackupSnapshotApp` from `server/app.ts` and listens on a local port.
2. Send a GET request to `/ops/backups/snapshot` with a `db` query parameter to trigger a snapshot.

Example runner:
```ts
import { buildBackupSnapshotApp } from "./server/app.js";

const app = buildBackupSnapshotApp();
app.listen(3000, () => console.log("Backup Snapshot on :3000"));
```

Example request:
```bash
curl "http://localhost:3000/ops/backups/snapshot?db=appdb"
```
