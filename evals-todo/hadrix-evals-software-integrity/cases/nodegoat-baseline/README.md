# Profile Snapshot Restore

Profile Snapshot Restore is a lightweight helper for support staff to paste a legacy serialized profile blob and rehydrate a user's preferences after a migration.

**Run**
1. Create a runner that imports `buildProfileSnapshotRestoreApp` from `server/app.ts` and listens on a local port.
2. Send a POST request to `/profile/restore` with a JSON body.

Example runner:
```ts
import { buildProfileSnapshotRestoreApp } from "./server/app.js";

const app = buildProfileSnapshotRestoreApp();
app.listen(3000, () => console.log("Profile Snapshot Restore on :3000"));
```

Example request:
```bash
curl -X POST http://localhost:3000/profile/restore \
  -H 'content-type: application/json' \
  -d '{"profile":"{\"name\":\"Ava\",\"theme\":\"midnight\"}"}'
```

The endpoint responds with the rehydrated profile JSON so support can confirm the restore.
