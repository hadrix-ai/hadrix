export const GOATDESK_SUPPORT_PORTAL_ROUTES = {
  login: "/support/login",
  health: "/support/health",
} as const;

export const GOATDESK_SUPPORT_PORTAL_LABELS = {
  appName: "GoatDesk Support Portal",
  loginTitle: "Agent Sign-In",
  loginSubtitle: "Use your support credentials to open the queue.",
} as const;

export const GOATDESK_SUPPORT_PORTAL_DEFAULTS = {
  rememberMeDefault: false,
  resetGuidance: "Password resets are handled by the ops team.",
} as const;
