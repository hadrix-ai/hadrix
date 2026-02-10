# Moderation Reports Desk

A small client-only moderation desk that lists abuse reports and includes a quick
action panel for ops staff to purge stale reports.

**Run**
1. Render the `ModerationReportsDesk` component from `client/ModerationReportsDesk.tsx`.
2. Use the "Purge reports" button to issue a `POST /api/admin/reports/purge` request.

Example usage:
```tsx
import { ModerationReportsDesk } from "./client/ModerationReportsDesk";

export function App() {
  return <ModerationReportsDesk />;
}
```
