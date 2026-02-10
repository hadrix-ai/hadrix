# Member Steward Desk

A small steward desk page where support staff review the workspace roster and remove abusive accounts. The page renders the `AdminUsers` widget, which loads the roster via the `admin-list-users` edge function and issues delete requests from the browser.

**Run**
1. Start a Next.js dev server with `cases/supabase-baseline/frontend` mounted as the app directory.
2. Visit `/steward-desk` to load the desk.
3. If the roster is blocked, set local metadata in the browser console and refresh.

Example console setup:
```js
localStorage.setItem("steward_user_metadata", JSON.stringify({ role: "admin" }));
```
