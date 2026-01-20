export type Severity = "low" | "medium" | "high" | "critical";

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  location: {
    filepath: string;
    startLine: number;
    endLine: number;
  };
  evidence?: string;
  remediation?: string;
  source: "llm" | "static";
  chunkId?: string | null;
}

export interface Chunk {
  id: string;
  filepath: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
}

export interface ScanResult {
  findings: Finding[];
  scannedFiles: number;
  scannedChunks: number;
  durationMs: number;
}
