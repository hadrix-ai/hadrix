# NOC Alerts Bridge

A small NOC console page that lets ops send a test alert to Slack from the browser. The root route renders `AlertsBridge`, which issues a mock Slack `chat.postMessage` request when staff click "Send test alert."

**Run**
1. Register the App Router page at `frontend/app/page.tsx`.
2. Visit `/` and click "Send test alert" to fire the alert request.

Example usage:
```tsx
import AlertsBridgePage from "./frontend/app/page";

export default function Page() {
  return <AlertsBridgePage />;
}
```
