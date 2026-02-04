export type ScanProgressPhase =
  | "static_scanners"
  | "llm_map"
  | "llm_rule"
  | "llm_open"
  | "llm_composite"
  | "postprocess";

export type ScanProgressEvent = {
  phase: ScanProgressPhase;
  current: number;
  total: number;
  message?: string;
};

export type ScanProgressHandler = (event: ScanProgressEvent) => void;
