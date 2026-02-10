export const PREFLIGHT_STATUS = {
  idle: "idle",
  running: "running",
  done: "done",
  error: "error",
} as const;

export const PREFLIGHT_STATUS_LABELS = {
  [PREFLIGHT_STATUS.idle]: "idle",
  [PREFLIGHT_STATUS.running]: "running",
  [PREFLIGHT_STATUS.done]: "done",
  [PREFLIGHT_STATUS.error]: "error",
} as const;
