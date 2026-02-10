export const AUDIT_TRAIL_COPY = {
  title: "Audit Trail Console",
  description:
    "Review recent activity and add quick notes when you spot something worth flagging.",
  sections: {
    recent: "Recent Activity",
    addNote: "Append A Quick Note",
  },
  form: {
    actorIdLabel: "Actor ID",
    actionLabel: "Action Type",
    noteLabel: "Note Summary",
    submitLabel: "Add Note",
  },
} as const;

export const AUDIT_TRAIL_QUERY =
  "select id, actor_id, action, summary, created_at from public.audit_logs order by created_at desc limit 25";
export const AUDIT_TRAIL_INSERT_QUERY =
  "insert into public.audit_logs (actor_id, action, summary) values ($1, $2, $3)";
