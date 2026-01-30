import path from "node:path";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { RepositoryScanFinding } from "../types.js";

const RESUME_DIR = "resume";
const STATE_FILE = "scan-resume.json";
const RESULTS_FILE = "scan-resume-results.jsonl";
const RESUME_VERSION = 1 as const;

export type ScanResumeStatus = "running" | "interrupted" | "complete";
export type ScanResumeStage = "rule" | "composite" | "finalize";

export type ScanResumeSnapshot = {
  hash: string;
  fileCount: number;
};

export type ScanResumeState = {
  version: typeof RESUME_VERSION;
  status: ScanResumeStatus;
  scanRoot: string;
  repoPath: string | null;
  repoSnapshot?: ScanResumeSnapshot;
  startedAt: string;
  updatedAt: string;
  stage: ScanResumeStage;
  taskCounts?: {
    rule?: number;
  };
  taskCompleted?: {
    rule?: number;
  };
  lastError?: {
    message: string;
    stage: ScanResumeStage;
  };
};

export type ScanResumeStore = {
  getRuleResults: () => Map<string, RepositoryScanFinding[]>;
  getCompositeResults: () => RepositoryScanFinding[] | null;
  setStage: (stage: ScanResumeStage) => Promise<void>;
  setRuleTaskCount: (count: number) => Promise<void>;
  recordRuleResult: (taskKey: string, findings: RepositoryScanFinding[]) => Promise<void>;
  recordCompositeResult: (findings: RepositoryScanFinding[]) => Promise<void>;
  markInterrupted: (message: string, stage: ScanResumeStage) => Promise<void>;
  markCompleted: () => Promise<void>;
};

type ResumeRuleLine = {
  kind: "rule";
  taskKey: string;
  findings: RepositoryScanFinding[];
};

type ResumeCompositeLine = {
  kind: "composite";
  findings: RepositoryScanFinding[];
};

type ResumeLine = ResumeRuleLine | ResumeCompositeLine;

type ResumePaths = {
  dir: string;
  statePath: string;
  resultsPath: string;
};

function normalizeRepoPath(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\/*/, "")
    .replace(/\/+$/, "");
}

function getResumePaths(stateDir: string): ResumePaths {
  const dir = path.join(stateDir, RESUME_DIR);
  return {
    dir,
    statePath: path.join(dir, STATE_FILE),
    resultsPath: path.join(dir, RESULTS_FILE)
  };
}

function isCompatibleState(state: ScanResumeState, scanRoot: string, repoPath: string | null): boolean {
  if (state.scanRoot !== scanRoot) return false;
  const expectedRepoPath = normalizeRepoPath(repoPath ?? "");
  const storedRepoPath = normalizeRepoPath(state.repoPath ?? "");
  return expectedRepoPath === storedRepoPath;
}

function isSnapshotMatch(
  state: ScanResumeState,
  snapshot: ScanResumeSnapshot | null | undefined
): boolean {
  if (!snapshot || !state.repoSnapshot) return false;
  return (
    snapshot.hash === state.repoSnapshot.hash &&
    snapshot.fileCount === state.repoSnapshot.fileCount
  );
}

async function loadResumeResults(
  resultsPath: string
): Promise<{ ruleResults: Map<string, RepositoryScanFinding[]>; compositeResults: RepositoryScanFinding[] | null }> {
  const ruleResults = new Map<string, RepositoryScanFinding[]>();
  let compositeResults: RepositoryScanFinding[] | null = null;
  if (!existsSync(resultsPath)) {
    return { ruleResults, compositeResults };
  }
  const raw = await readFile(resultsPath, "utf-8");
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ResumeLine;
      if (parsed.kind === "rule" && parsed.taskKey) {
        ruleResults.set(parsed.taskKey, parsed.findings ?? []);
      } else if (parsed.kind === "composite") {
        compositeResults = parsed.findings ?? [];
      }
    } catch {
      // Ignore malformed resume lines.
    }
  }
  return { ruleResults, compositeResults };
}

async function writeResumeState(paths: ResumePaths, state: ScanResumeState): Promise<void> {
  await mkdir(paths.dir, { recursive: true });
  await writeFile(paths.statePath, `${JSON.stringify(state, null, 2)}\n`, "utf-8");
}

export async function loadScanResumeState(stateDir: string): Promise<ScanResumeState | null> {
  const { statePath } = getResumePaths(stateDir);
  if (!existsSync(statePath)) return null;
  try {
    const raw = await readFile(statePath, "utf-8");
    const parsed = JSON.parse(raw) as ScanResumeState;
    if (!parsed || parsed.version !== RESUME_VERSION) return null;
    if (!parsed.scanRoot) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function clearScanResumeState(stateDir: string): Promise<void> {
  const { statePath, resultsPath } = getResumePaths(stateDir);
  if (existsSync(statePath)) {
    await rm(statePath, { force: true });
  }
  if (existsSync(resultsPath)) {
    await rm(resultsPath, { force: true });
  }
}

export async function createScanResumeStore(params: {
  stateDir: string;
  scanRoot: string;
  repoPath: string | null;
  repoSnapshot?: ScanResumeSnapshot | null;
  mode: "new" | "resume";
  logger?: (message: string) => void;
}): Promise<ScanResumeStore> {
  const paths = getResumePaths(params.stateDir);
  const now = new Date().toISOString();
  let state: ScanResumeState;
  let ruleResults = new Map<string, RepositoryScanFinding[]>();
  let compositeResults: RepositoryScanFinding[] | null = null;

  const existing =
    params.mode === "resume" ? await loadScanResumeState(params.stateDir) : null;
  if (
    existing &&
    isCompatibleState(existing, params.scanRoot, params.repoPath) &&
    isSnapshotMatch(existing, params.repoSnapshot)
  ) {
    const loaded = await loadResumeResults(paths.resultsPath);
    ruleResults = loaded.ruleResults;
    compositeResults = loaded.compositeResults;
    state = {
      ...existing,
      status: "running",
      updatedAt: now,
      lastError: undefined,
      repoSnapshot: params.repoSnapshot ?? existing.repoSnapshot
    };
  } else {
    if (existing) {
      const scopeMismatch = !isCompatibleState(existing, params.scanRoot, params.repoPath);
      const snapshotMismatch = !isSnapshotMatch(existing, params.repoSnapshot);
      if (scopeMismatch) {
        params.logger?.("Resume state found but did not match current scan scope; starting fresh.");
      } else if (snapshotMismatch) {
        params.logger?.("Resume state found but repo contents changed; starting fresh.");
      } else {
        params.logger?.("Resume state found but could not be verified; starting fresh.");
      }
    }
    await mkdir(paths.dir, { recursive: true });
    if (existsSync(paths.resultsPath)) {
      await rm(paths.resultsPath, { force: true });
    }
    state = {
      version: RESUME_VERSION,
      status: "running",
      scanRoot: params.scanRoot,
      repoPath: params.repoPath,
      repoSnapshot: params.repoSnapshot ?? undefined,
      startedAt: now,
      updatedAt: now,
      stage: "rule",
      taskCounts: {},
      taskCompleted: {}
    };
  }

  await writeResumeState(paths, state);

  let writeQueue = Promise.resolve();
  const enqueueWrite = async (fn: () => Promise<void>) => {
    writeQueue = writeQueue.then(fn, fn);
    await writeQueue;
  };

  const updateState = async (next: Partial<ScanResumeState>) => {
    state = { ...state, ...next, updatedAt: new Date().toISOString() };
    await writeResumeState(paths, state);
  };

  return {
    getRuleResults: () => ruleResults,
    getCompositeResults: () => compositeResults,
    setStage: async (stage) => {
      await updateState({ stage });
    },
    setRuleTaskCount: async (count) => {
      const taskCounts = { ...(state.taskCounts ?? {}) };
      taskCounts.rule = count;
      await updateState({ taskCounts });
    },
    recordRuleResult: async (taskKey, findings) => {
      if (!taskKey || ruleResults.has(taskKey)) return;
      ruleResults.set(taskKey, findings);
      const line: ResumeRuleLine = { kind: "rule", taskKey, findings };
      await enqueueWrite(async () => {
        await appendFile(paths.resultsPath, `${JSON.stringify(line)}\n`, "utf-8");
      });
      const taskCompleted = { ...(state.taskCompleted ?? {}) };
      taskCompleted.rule = (taskCompleted.rule ?? 0) + 1;
      await updateState({ taskCompleted });
    },
    recordCompositeResult: async (findings) => {
      compositeResults = findings;
      const line: ResumeCompositeLine = { kind: "composite", findings };
      await enqueueWrite(async () => {
        await appendFile(paths.resultsPath, `${JSON.stringify(line)}\n`, "utf-8");
      });
      await updateState({ stage: "finalize" });
    },
    markInterrupted: async (message, stage) => {
      await updateState({
        status: "interrupted",
        stage,
        lastError: { message, stage }
      });
    },
    markCompleted: async () => {
      await updateState({ status: "complete", stage: "finalize", lastError: undefined });
      if (existsSync(paths.resultsPath)) {
        await rm(paths.resultsPath, { force: true });
      }
    }
  };
}
