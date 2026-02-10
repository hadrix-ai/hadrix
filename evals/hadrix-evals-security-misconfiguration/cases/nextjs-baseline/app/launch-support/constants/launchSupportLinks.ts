export const LAUNCH_SUPPORT_ORG_ID = "launch-support";

export const LAUNCH_SUPPORT_ENDPOINTS = {
  debug: (orgId: string) => `/api/debug?orgId=${orgId}`,
  status: "/api/status"
} as const;
