export const DEVELOPER_CONSOLE_COPY = {
  eyebrow: "Developer Access",
  title: "Developer Access Console",
  lede:
    "Issue integration tokens for partner apps and sanity-check the raw token endpoint before handing it off.",
  panels: {
    manual: {
      title: "Manual Issue",
      description: "Mint a token directly into the workspace vault for a specific user.",
      userLabel: "User id",
      userPlaceholder: "user_9a5d0",
      labelLabel: "Token label",
      labelPlaceholder: "sync-worker",
      submitLabel: "Create token"
    },
    endpoint: {
      title: "Endpoint Preview",
      description: "Call the API token endpoint the same way an integration client would.",
      tokenLabel: "Bearer token",
      tokenPlaceholder: "paste a session token",
      submitLabel: "Call /api/tokens",
      statusPrefix: "Status:",
      resultLabel: "Latest token"
    }
  }
} as const;
