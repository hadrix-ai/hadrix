# Session Kickstart

A lightweight onboarding helper that issues a short-lived session token right after account creation so new users can land in the starter dashboard without a separate login step.

**Run**
1. Create a runner that imports `buildSessionKickstartApp` from `server/app.ts` and listens on a local port.
2. Send a POST request to `/onboarding/kickstart` with a JSON body.

Example runner:
```ts
import { buildSessionKickstartApp } from "./server/app.js";

const app = buildSessionKickstartApp();
app.listen(3000, () => console.log("Session Kickstart on :3000"));
```

Example request:
```bash
curl -X POST http://localhost:3000/onboarding/kickstart \
  -H 'content-type: application/json' \
  -d '{"userId":"user_123","email":"demo@crystals.test","plan":"starter"}'
```
