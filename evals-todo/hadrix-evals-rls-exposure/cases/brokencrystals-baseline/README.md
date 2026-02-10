# BrokenCrystals Account Directory

A small Express endpoint used by support and sales to browse the BrokenCrystals partner roster during onboarding. The directory loads account rows from the `accounts` table and returns them as JSON.

**Run**
1. Create a small runner that imports `buildAccountDirectoryApp` from `server/app.ts` and listens on a local port.
2. Send a GET request to `/account-directory` to fetch the account directory.

Example runner:
```ts
import { buildAccountDirectoryApp } from "./server/app.js";

const app = buildAccountDirectoryApp();
app.listen(3000, () => console.log("Account Directory on :3000"));
```

Example request:
```bash
curl http://localhost:3000/account-directory
```
