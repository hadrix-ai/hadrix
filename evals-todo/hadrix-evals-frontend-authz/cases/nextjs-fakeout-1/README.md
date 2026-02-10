# Access Review Desk

A small on-call desk that lets support staff review accounts and remove abusive users during incidents. The page renders the `AdminUsers` widget, which loads the roster and issues delete requests from the browser.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/access-review` to load the desk.
3. If the roster is blocked, drop a support token into local storage and refresh.

Example console setup:
```js
localStorage.setItem(
  "access_token",
  "eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4iLCJleHAiOjk5OTk5OTk5OTl9."
);
```
