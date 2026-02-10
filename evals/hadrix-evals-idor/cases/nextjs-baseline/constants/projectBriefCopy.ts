export const PROJECT_BRIEF_COPY = {
  eyebrow: "Project Brief",
  title: "Ticket Snapshot",
  lede: "Drop in a project id from the queue, pull the summary, and keep moving.",
  sections: {
    lookup: "Lookup",
    summary: "Summary"
  },
  labels: {
    projectId: "Project id",
    sessionToken: "Session token",
    name: "Name",
    org: "Org",
    description: "Description",
    htmlNote: "HTML note",
    status: "Status:"
  },
  placeholders: {
    sessionToken: "Paste a session token"
  },
  actions: {
    load: "Load brief",
    loading: "Loading..."
  },
  status: {
    ready: "ready",
    missingProjectId: "missing project id",
    loading: "loading project brief...",
    loaded: "project brief loaded",
    notFound: "no project found for that id",
    failed: "failed to load project brief",
    errorPrefix: "error: "
  },
  fallbacks: {
    org: "unassigned",
    description: "(no description)",
    htmlNote: "(empty)",
    emptyState: "No project loaded yet."
  }
} as const;
