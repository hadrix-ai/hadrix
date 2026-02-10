export const LAUNCHPAD_OPS_CONSOLE_CONFIG = {
  title: "Launchpad Ops Console",
  subtitle: "Quick tools for project setup, repo scans, token handoff, and account cleanup.",
  apiRoutes: {
    projects: "/api/projects",
    scan: "/api/scan",
    tokens: "/api/tokens",
    adminUsers: "/api/admin/users"
  },
  sections: {
    session: {
      title: "Session Token",
      description: "Paste a session token to authorize admin and project actions.",
      placeholder: "Bearer token"
    },
    createProject: {
      title: "Create Project",
      namePlaceholder: "Project name",
      descriptionPlaceholder: "Plain description",
      htmlPlaceholder: "HTML description",
      submitLabel: "Create project",
      busyLabel: "Saving..."
    },
    scanRepo: {
      title: "Run Repo Scan",
      placeholder: "https://github.com/org/repo.git",
      submitLabel: "Scan repository",
      busyLabel: "Scanning..."
    },
    issueToken: {
      title: "Issue API Token",
      submitLabel: "Issue token",
      busyLabel: "Issuing..."
    },
    deleteUser: {
      title: "Admin Delete User",
      placeholder: "User id",
      submitLabel: "Delete user",
      busyLabel: "Removing..."
    }
  }
} as const;
