export const OPS_CONSOLE_COPY = {
  eyebrow: "Reliability Ops",
  title: "Incident Console",
  lede:
    "Pull live rosters, validate org projects, run repo checks, and stash incident artifacts from one pane while the on-call rotations are hot.",
  panels: {
    session: "Session Keys",
    adminRoster: "Admin Roster",
    orgProjects: "Org Projects",
    repoScan: "Repo Scan",
    incidentUpload: "Incident Upload"
  },
  labels: {
    token: "Bearer token",
    mfa: "MFA code",
    repoUrl: "Repository URL",
    artifactNotes: "Artifact notes"
  },
  placeholders: {
    token: "paste JWT token",
    mfa: "one-time code",
    repoUrl: "https://github.com/org/repo.git"
  },
  buttons: {
    loadRoster: "Load roster",
    loadProjects: "Load projects",
    runScan: "Run scan",
    uploadArtifact: "Upload artifact"
  }
} as const;
