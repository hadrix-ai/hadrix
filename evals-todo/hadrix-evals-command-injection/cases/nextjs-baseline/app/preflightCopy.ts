export const PREFLIGHT_COPY = {
  title: "Repo Intake Preflight",
  intro: "Paste a Git URL to confirm we can reach it before the full scan runs.",
  form: {
    label: "Repository URL",
    placeholder: "https://github.com/acme/ship-it.git",
    submit: "Run preflight",
  },
  statusLabel: "Status:",
  errorFallback: "Unable to reach the scan endpoint.",
} as const;
