# Workspace Ops Roster

A small ops roster page where staff can review the user directory and remove accounts during support shifts. The page renders the `AdminUsers` widget, which loads the admin list and issues delete requests from the browser.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/ops` to load the roster UI.
3. If the roster is hidden, set `localStorage.role = "admin"` in the browser console and refresh.

Example console setup:
```js
localStorage.setItem("role", "admin");
```
