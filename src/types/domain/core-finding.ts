import type { Severity } from "./severity.js";

export interface CoreFinding {
  type: "static" | "repository" | "repository_composite";
  source: string;
  severity: Severity;
  summary: string;
  category?: string | null;
  location?: Record<string, unknown> | null;
  details: Record<string, unknown>;
}

export interface CoreScanResult {
  findings: CoreFinding[];
  compositeFindings: CoreFinding[];
  scannedFiles: number;
  scannedChunks: number;
  durationMs: number;
}
