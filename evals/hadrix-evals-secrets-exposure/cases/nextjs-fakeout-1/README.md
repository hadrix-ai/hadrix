# Ops Triage Console

A small Ops Triage Console page that lets support staff load a quick user roster during incident response. The `/triage` route renders `AdminDashboard`, which triggers a Supabase admin query when staff click the "Load users" button.

**Run**
1. Register the App Router page at `app/triage/page.tsx`.
2. Visit `/triage` and click "Load users" to fire the roster request.

Example usage:
```tsx
import TriagePage from "./app/triage/page";

export default function Page() {
  return <TriagePage />;
}
```
