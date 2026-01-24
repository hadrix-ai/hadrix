export type DebugLogFn = (event: Record<string, unknown>) => void;

export type DedupeDebug = {
  stage: string;
  log: DebugLogFn;
};
