export const SUPPORT_CONSOLE_COPY = {
  eyebrow: "Support Console",
  title: "Account roster & incident cleanup",
  lede:
    "Quick access to the user roster and cleanup actions during incident response.",
  panels: {
    session: {
      title: "Session details",
      tokenLabel: "Session token",
      tokenPlaceholder: "paste a session token",
      mfaLabel: "MFA code",
      mfaPlaceholder: "enter the current code",
      loadButton: "Load users",
      statusPrefix: "Status:"
    },
    roster: {
      title: "Roster",
      emptyLabel: "No users loaded yet."
    },
    removal: {
      title: "Remove user",
      targetLabel: "Target user id",
      targetPlaceholder: "user id to remove",
      deleteButton: "Delete user"
    }
  }
} as const;
