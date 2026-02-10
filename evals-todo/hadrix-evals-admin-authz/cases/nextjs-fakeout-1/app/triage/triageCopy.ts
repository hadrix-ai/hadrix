export const TRIAGE_COPY = {
  eyebrow: "Support Triage",
  title: "User Roster Snapshot",
  lede:
    "Quick peek at the full roster when an incident hits. Paste a session token and load the directory without leaving the console.",
  panels: {
    session: {
      tokenLabel: "Session token",
      tokenPlaceholder: "Bearer token from a support session",
      roleLabel: "Claimed role",
      rolePlaceholder: "support",
      mfaLabel: "MFA code",
      mfaPlaceholder: "000000",
      loadButton: "Load roster",
      loadingButton: "Loading...",
      statusPrefix: "Status:"
    },
    roster: {
      title: "Roster",
      emptyLabel: "No users loaded yet."
    }
  }
} as const;
