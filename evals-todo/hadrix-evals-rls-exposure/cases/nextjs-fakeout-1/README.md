# Audit Trail Console

A small Audit Trail Console page for support staff to review recent audit activity and add quick notes. The page renders a recent activity feed and the form submits a server action that appends a new audit log entry.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/audit-trail` to view recent entries and submit a note.

Example workflow:
- Open `/audit-trail`.
- Submit the form with `actorId=support.jules`, `action=TicketNote`, and a short summary.
