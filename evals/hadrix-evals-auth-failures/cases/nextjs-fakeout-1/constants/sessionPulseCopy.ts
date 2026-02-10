import { SessionPulseRole } from "../types/api/sessionPulseApiResponse";

export const SESSION_PULSE_DEFAULT_ROLE: SessionPulseRole = "member";

export const SESSION_PULSE_COPY = {
  headerEyebrow: "Session Pulse",
  headerTitle: "Console Home",
  statusLabel: "Status",
  sessionLabel: "Signed in as",
  refreshLabel: "Refresh",
  quickLinksTitle: "Quick links",
  overviewTitle: "Daily overview",
  overviewBody:
    "The session pulse keeps the console header in sync with the current user so teams can troubleshoot access quickly.",
  messages: {
    idle: "waiting for session",
    loading: "loading session pulse...",
    ready: "session pulse ready",
    missing: "missing session",
    error: "unable to reach session pulse"
  },
  fallbacks: {
    guestUser: "guest",
    noEmail: "no email on file"
  }
} as const;

export const SESSION_PULSE_QUICK_LINKS = [
  { href: "/workspace", label: "Workspace" },
  { href: "/queues", label: "Queues" },
  { href: "/settings", label: "Settings" }
] as const;
