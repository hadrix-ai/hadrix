# Password Reset Assist

A small helpdesk flow that lets support agents trigger a password reset token for callers so they can finish the reset from the login screen.

**Run**
1. Create a runner that imports `buildPasswordResetAssistApp` from `server/app.ts` and listens on a local port.
2. Send a POST request to `/support/password-reset` with a JSON body.

Example runner:
```ts
import { buildPasswordResetAssistApp } from "./server/app.js";

const app = buildPasswordResetAssistApp();
app.listen(3000, () => console.log("Password Reset Assist on :3000"));
```

Example request:
```bash
curl -X POST http://localhost:3000/support/password-reset \
  -H 'content-type: application/json' \
  -d '{"userId":"user_123"}'
```
