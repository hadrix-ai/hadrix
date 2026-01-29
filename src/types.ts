import type { CoreFinding, CoreScanResult } from "./types/domain/core-finding.js";
import type { Severity } from "./types/domain/severity.js";

export type { CoreFinding, CoreScanResult, Severity };

export type SecurityHeader = {
  entry_point: {
    type: string;
    identifier: string;
  };
  execution_role: string;
  trust_boundaries: string[];
  authentication: {
    enforced: string;
    mechanism: string;
    location?: string;
  };
  authorization: {
    enforced: string;
    model: string;
  };
  input_sources: string[];
  data_sensitivity: string[];
  sinks: string[];
  reachability?: {
    entry_points: string[];
    min_depth?: number | null;
  };
  security_assumptions: string[];
};

export interface Finding {
  id: string;
  title: string;
  severity: Severity;
  description: string;
  category?: string | null;
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
  tool: "semgrep" | "gitleaks" | "osv-scanner" | "eslint" | "supabase";
  ruleId: string;
  message: string;
  severity: Severity;
  filepath: string;
  startLine: number;
  endLine: number;
  snippet?: string;
  details?: Record<string, unknown>;
}

export interface RepositoryFileSample {
  path: string;
  startLine: number;
  endLine: number;
  chunkIndex: number;
  content: string;
  truncated?: boolean;
  overlapGroupId?: string | null;
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
  repositoryId?: string;
  repositoryFullName?: string;
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
  chunkFormat?: string | null;
  securityHeader?: SecurityHeader | null;
  primarySymbol?: string | null;
  entryPoint?: string | null;
  executionRole?: string | null;
  sinks?: string[] | null;
  overlapGroupId?: string | null;
  dedupeKey?: string | null;
}

export interface ScanResult {
  findings: Finding[];
  scannedFiles: number;
  scannedChunks: number;
  durationMs: number;
  staticFindings?: StaticFinding[];
  repositoryFindings?: RepositoryScanFinding[];
  compositeFindings?: RepositoryScanFinding[];
  existingFindings?: ExistingScanFinding[];
  coreFindings?: CoreFinding[];
  coreCompositeFindings?: CoreFinding[];
}
