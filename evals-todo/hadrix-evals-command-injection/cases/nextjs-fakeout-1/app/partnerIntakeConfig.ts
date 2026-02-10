export const DEFAULT_REPO_URL = "https://github.com/acme/partner-repo.git";

export const SCAN_STATUS = {
  idle: "idle",
  pending: "pending",
  done: "done",
  error: "error",
} as const;

export type ScanStatus = (typeof SCAN_STATUS)[keyof typeof SCAN_STATUS];
