# Workspace Directory

A small Workspace Directory page for ops to browse active projects and quickly add members during onboarding. The page renders the project roster and the quick-add form triggers a server action to insert a new org member row.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/workspaces` to view the roster and submit the quick-add form.

Example workflow:
- Open `/workspaces`.
- Submit the form with `orgId=org-demo`, `userId=user-demo`, and `role=viewer`.
