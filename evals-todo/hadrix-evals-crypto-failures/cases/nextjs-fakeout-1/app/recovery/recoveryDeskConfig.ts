export const RECOVERY_DESK_ENDPOINT = "/api/password-reset";

export const RECOVERY_STATUS_MESSAGES = {
  idle: "ready",
  requesting: "requesting reset token...",
  issued: "reset token issued",
  failed: "request failed"
} as const;
