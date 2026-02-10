export const SUPPORT_DIAGNOSTICS_CONFIG = {
  panelTitle: "Support Diagnostics",
  description: "Quick ping checks for customer-reported connectivity.",
  defaultHostHint: "status.internal",
  // TODO: allow per-team customization of the default host hint.
  tags: ["ping", "latency", "triage"] as const,
} as const;
