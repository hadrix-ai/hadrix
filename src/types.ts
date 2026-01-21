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
    repoPath?: string;
  };
  evidence?: string;
  remediation?: string;
  source: "llm" | "static";
  chunkId?: string | null;
}

export interface StaticFinding {
  tool: "semgrep" | "gitleaks" | "osv-scanner" | "eslint";
  ruleId: string;
  message: string;
  severity: Severity;
  filepath: string;
  startLine: number;
  endLine: number;
  snippet?: string;
}

export interface RepositoryFileSample {
  path: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
  content: string;
  truncated?: boolean;
}

export interface RepositoryScanFinding {
  repositoryId?: string;
  repositoryFullName?: string;
  type?: string | null;
  severity: Severity;
  summary: string;
  evidence?: string[];
  details: Record<string, unknown>;
  location?: Record<string, unknown> | null;
}

export interface ExistingScanFinding {
  type?: string | null;
  source?: string | null;
  severity?: Severity | null;
  summary: string;
  location?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
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
