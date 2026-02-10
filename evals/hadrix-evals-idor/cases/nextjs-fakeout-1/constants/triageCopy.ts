export const TRIAGE_COPY = {
  eyebrow: "Support Queue",
  title: "Project Triage Snapshot",
  lede: "Quickly load a project summary from an incident ticket without leaving the queue.",
  sections: {
    lookup: "Snapshot Lookup",
    summary: "Project Summary"
  },
  labels: {
    projectId: "Project ID",
    sessionToken: "Session Token",
    status: "Status",
    name: "Name",
    org: "Org",
    description: "Notes",
    htmlNote: "HTML Summary"
  },
  actions: {
    load: "Load Snapshot",
    loading: "Loading..."
  },
  placeholders: {
    sessionToken: "Paste a support session token"
  },
  fallbacks: {
    org: "No org tagged",
    description: "No plain-text summary",
    htmlNote: "No HTML summary",
    emptyState: "No snapshot loaded yet."
  },
  status: {
    idle: "Ready",
    missingProjectId: "Missing project id",
    loading: "Contacting project service",
    loaded: "Snapshot loaded",
    notFound: "No project returned",
    failed: "Snapshot request failed",
    errorPrefix: "Error: "
  }
} as const;
