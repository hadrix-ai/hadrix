import path from "node:path";
import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import type { RepositoryScanFinding } from "../types.js";
import type { Logger } from "../logging/logger.js";

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
    map?: number;
    rule?: number;
  };
  taskCompleted?: {
    map?: number;
    rule?: number;
  };
  lastError?: {
    message: string;
    stage: ScanResumeStage;
  };
};

export type ScanResumeStore = {
  getMapResults: () => Map<string, unknown>;
  getRuleResults: () => Map<string, RepositoryScanFinding[]>;
  getCompositeResults: () => RepositoryScanFinding[] | null;
  setStage: (stage: ScanResumeStage) => Promise<void>;
  setMapTaskCount: (count: number) => Promise<void>;
  setRuleTaskCount: (count: number) => Promise<void>;
  recordMapResult: (chunkId: string, understanding: unknown) => Promise<void>;
  recordRuleResult: (taskKey: string, findings: RepositoryScanFinding[]) => Promise<void>;
  recordCompositeResult: (findings: RepositoryScanFinding[]) => Promise<void>;
  markInterrupted: (message: string, stage: ScanResumeStage) => Promise<void>;
  markCompleted: () => Promise<void>;
};

type ResumeMapLine = {
  kind: "map";
  chunkId: string;
  understanding: unknown;
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

type ResumeLine = ResumeMapLine | ResumeRuleLine | ResumeCompositeLine;

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
): Promise<{
  mapResults: Map<string, unknown>;
  ruleResults: Map<string, RepositoryScanFinding[]>;
  compositeResults: RepositoryScanFinding[] | null;
}> {
  const mapResults = new Map<string, unknown>();
  const ruleResults = new Map<string, RepositoryScanFinding[]>();
  let compositeResults: RepositoryScanFinding[] | null = null;
  if (!existsSync(resultsPath)) {
    return { mapResults, ruleResults, compositeResults };
  }
  const raw = await readFile(resultsPath, "utf-8");
  const lines = raw.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line) as ResumeLine;
      if (parsed.kind === "map" && parsed.chunkId) {
        mapResults.set(parsed.chunkId, parsed.understanding ?? null);
      } else if (parsed.kind === "rule" && parsed.taskKey) {
        ruleResults.set(parsed.taskKey, parsed.findings ?? []);
      } else if (parsed.kind === "composite") {
        compositeResults = parsed.findings ?? [];
      }
    } catch {
      // Ignore malformed resume lines.
    }
  }
  return { mapResults, ruleResults, compositeResults };
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
  logger?: Logger;
}): Promise<ScanResumeStore> {
  const paths = getResumePaths(params.stateDir);
  const now = new Date().toISOString();
  let state: ScanResumeState;
  let mapResults = new Map<string, unknown>();
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
    mapResults = loaded.mapResults;
    ruleResults = loaded.ruleResults;
    compositeResults = loaded.compositeResults;
    state = {
      ...existing,
      status: "running",
      updatedAt: now,
      lastError: undefined,
      repoSnapshot: params.repoSnapshot ?? existing.repoSnapshot
    };
    const mapCompleted = state.taskCompleted?.map ?? 0;
    const mapTotal = state.taskCounts?.map ?? 0;
    const ruleCompleted = state.taskCompleted?.rule ?? 0;
    const ruleTotal = state.taskCounts?.rule ?? 0;
    params.logger?.info(
      `Resume state loaded (stage=${state.stage}, map=${mapCompleted}/${mapTotal}, rule=${ruleCompleted}/${ruleTotal}, cachedMap=${mapResults.size}, cachedTasks=${ruleResults.size}, cachedComposite=${compositeResults?.length ?? 0}).`
    );
  } else {
    if (existing) {
      const scopeMismatch = !isCompatibleState(existing, params.scanRoot, params.repoPath);
      const snapshotMismatch = !isSnapshotMatch(existing, params.repoSnapshot);
      if (scopeMismatch) {
        params.logger?.info("Resume state found but did not match current scan scope; starting fresh.");
      } else if (snapshotMismatch) {
        params.logger?.info("Resume state found but repo contents changed; starting fresh.");
      } else {
        params.logger?.info("Resume state found but could not be verified; starting fresh.");
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
    params.logger?.info("Initialized new resume state.");
  }

  await writeResumeState(paths, state);

  let writeQueue = Promise.resolve();
  const enqueueWrite = async (fn: () => Promise<void>) => {
    writeQueue = writeQueue.then(fn, fn);
    await writeQueue;
  };

  return {
    getMapResults: () => mapResults,
    getRuleResults: () => ruleResults,
    getCompositeResults: () => compositeResults,
    setStage: async (stage) => {
      await enqueueWrite(async () => {
        state = { ...state, stage, updatedAt: new Date().toISOString() };
        await writeResumeState(paths, state);
      });
    },
    setMapTaskCount: async (count) => {
      await enqueueWrite(async () => {
        const taskCounts = { ...(state.taskCounts ?? {}) };
        taskCounts.map = count;
        state = { ...state, taskCounts, updatedAt: new Date().toISOString() };
        await writeResumeState(paths, state);
      });
    },
    setRuleTaskCount: async (count) => {
      await enqueueWrite(async () => {
        const taskCounts = { ...(state.taskCounts ?? {}) };
        taskCounts.rule = count;
        state = { ...state, taskCounts, updatedAt: new Date().toISOString() };
        await writeResumeState(paths, state);
      });
    },
    recordMapResult: async (chunkId, understanding) => {
      if (!chunkId || mapResults.has(chunkId)) return;
      const normalized = understanding === undefined ? null : understanding;
      mapResults.set(chunkId, normalized);
      const line: ResumeMapLine = { kind: "map", chunkId, understanding: normalized };
      await enqueueWrite(async () => {
        await appendFile(paths.resultsPath, `${JSON.stringify(line)}\n`, "utf-8");
        const taskCompleted = { ...(state.taskCompleted ?? {}) };
        taskCompleted.map = (taskCompleted.map ?? 0) + 1;
        state = { ...state, taskCompleted, updatedAt: new Date().toISOString() };
        await writeResumeState(paths, state);
      });
    },
    recordRuleResult: async (taskKey, findings) => {
      if (!taskKey || ruleResults.has(taskKey)) return;
      ruleResults.set(taskKey, findings);
      const line: ResumeRuleLine = { kind: "rule", taskKey, findings };
      await enqueueWrite(async () => {
        await appendFile(paths.resultsPath, `${JSON.stringify(line)}\n`, "utf-8");
        const taskCompleted = { ...(state.taskCompleted ?? {}) };
        taskCompleted.rule = (taskCompleted.rule ?? 0) + 1;
        state = { ...state, taskCompleted, updatedAt: new Date().toISOString() };
        await writeResumeState(paths, state);
      });
    },
    recordCompositeResult: async (findings) => {
      compositeResults = findings;
      const line: ResumeCompositeLine = { kind: "composite", findings };
      await enqueueWrite(async () => {
        await appendFile(paths.resultsPath, `${JSON.stringify(line)}\n`, "utf-8");
        state = { ...state, stage: "finalize", updatedAt: new Date().toISOString() };
        await writeResumeState(paths, state);
      });
    },
    markInterrupted: async (message, stage) => {
      await enqueueWrite(async () => {
        state = {
          ...state,
          status: "interrupted",
          stage,
          lastError: { message, stage },
          updatedAt: new Date().toISOString()
        };
        await writeResumeState(paths, state);
      });
      params.logger?.warn(`Scan marked interrupted (stage=${stage}): ${message}`);
    },
    markCompleted: async () => {
      await enqueueWrite(async () => {
        state = {
          ...state,
          status: "complete",
          stage: "finalize",
          lastError: undefined,
          updatedAt: new Date().toISOString()
        };
        await writeResumeState(paths, state);
        if (existsSync(paths.resultsPath)) {
          await rm(paths.resultsPath, { force: true });
        }
      });
      const mapCompleted = state.taskCompleted?.map ?? 0;
      const mapTotal = state.taskCounts?.map ?? 0;
      const ruleCompleted = state.taskCompleted?.rule ?? 0;
      const ruleTotal = state.taskCounts?.rule ?? 0;
      params.logger?.info(
        `Scan resume state marked complete (map=${mapCompleted}/${mapTotal}, rule=${ruleCompleted}/${ruleTotal}).`
      );
    }
  };
}
