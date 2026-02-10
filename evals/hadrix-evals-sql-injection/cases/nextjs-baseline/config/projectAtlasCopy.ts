export const projectAtlasCopy = {
  eyebrow: "Project Atlas",
  title: "Portfolio Radar",
  lede:
    "Pull quick project snapshots, filter the roster, and drill into a single record when a status story needs proof.",
  panels: {
    session: {
      title: "Session",
      tokenLabel: "Auth token",
      tokenPlaceholder: "Bearer token for your PM session"
    },
    roster: {
      title: "Roster filter",
      filterLabel: "Roster filter",
      filterPlaceholder: "status.eq.active,priority.eq.high",
      loadButton: "Load roster"
    },
    detail: {
      title: "Project detail",
      idLabel: "Project id",
      idPlaceholder: "project-id",
      loadButton: "Load detail"
    }
  }
} as const;
