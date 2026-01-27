import path from "node:path";
import type { Dirent } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";

import { isJellyAvailable, runJellyCallGraph } from "./jelly.js";

type JellyCallGraph = {
  files?: unknown;
  functions?: unknown;
  edges?: unknown;
  calls?: unknown;
  callgraph?: unknown;
  callGraph?: unknown;
};

type AnchorNode = {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  isModule: boolean;
};

export type AnchorLookup = {
  filepath: string;
  repoPath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
};

export type JellyAnchorNode = {
  anchorId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
};

export type AnchorIndex = {
  repoRoot: string;
  anchorCount: number;
  fileCount: number;
  getAnchorId: (lookup: AnchorLookup) => string | null;
  getAnchorsForFile: (lookup: { filepath: string; repoPath?: string | null }) => JellyAnchorNode[];
  callGraph?: JellyCallGraphIndex | null;
};

export type JellyAnchorComputation = {
  index: AnchorIndex | null;
  ran: boolean;
  durationMs: number;
  reason?: string;
  error?: string;
};

const JELLY_TIMEOUT_SECONDS = 120;
const JELLY_ERROR_SNIPPET = 1000;
const MAX_SCAN_ENTRIES = 4000;
const MAX_SCAN_DEPTH = 8;
const CONFIG_FILENAMES = ["package.json", "tsconfig.json", "jsconfig.json"];
const JS_TS_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  "out"
]);

const anchorCache = new Map<string, Promise<JellyAnchorComputation>>();

export type JellyFunctionNode = {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
  anchorId: string;
};

export type JellyCallGraphIndex = {
  functionById: Map<string, JellyFunctionNode>;
  anchorIdByFunctionId: Map<string, string>;
  functionIdByAnchorId: Map<string, string>;
  edgesByCaller: Map<string, string[]>;
  edgesByCallee: Map<string, string[]>;
};

function formatJellyRunError(runResult: {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}): string {
  const parts: string[] = [];
  if (typeof runResult.exitCode === "number") {
    parts.push(`exit code ${runResult.exitCode}`);
  } else if (!runResult.signal) {
    parts.push("exit code null");
  }
  if (runResult.signal) {
    parts.push(`signal ${runResult.signal}`);
  }
  const stderr = runResult.stderr.trim();
  const stdout = runResult.stdout.trim();
  if (stderr) {
    parts.push(`stderr: ${stderr.slice(0, JELLY_ERROR_SNIPPET)}`);
  } else if (stdout) {
    parts.push(`stdout: ${stdout.slice(0, JELLY_ERROR_SNIPPET)}`);
  }
  return parts.join(" | ") || "jelly exited with no output";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function toRecord(value: unknown): Record<string, unknown> {
  return isPlainObject(value) ? value : {};
}

function normalizePath(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\/*/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

function normalizeRepoPath(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\\/g, "/").trim().replace(/^[./]+/, "").replace(/\/+$/, "");
}

function normalizeFilepathForRepo(filepath: string, repoRoot: string): string {
  const trimmed = filepath.replace(/\\/g, "/").trim();
  if (!trimmed) return "";
  if (path.isAbsolute(trimmed)) {
    const rel = path.relative(repoRoot, trimmed);
    if (!rel.startsWith("..")) {
      return normalizePath(rel);
    }
  }
  return normalizePath(trimmed);
}

function canonicalizeFilePath(repoPath: string, filepath: string): string {
  const normalizedRepoPath = normalizeRepoPath(repoPath);
  const normalizedFilepath = normalizePath(filepath);
  if (!normalizedFilepath) return "";
  if (!normalizedRepoPath) return normalizedFilepath;
  if (normalizedFilepath.startsWith(`${normalizedRepoPath}/`)) {
    return normalizedFilepath;
  }
  return `${normalizedRepoPath}/${normalizedFilepath}`;
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function extractFindingLocation(
  finding: { location?: Record<string, unknown> | null },
  repoRoot: string
): {
  filepath: string;
  repoPath: string;
  startLine: number | null;
  endLine: number | null;
} | null {
  const location = toRecord(finding.location);
  const filepathRaw =
    (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  const filepath =
    typeof filepathRaw === "string" ? normalizeFilepathForRepo(filepathRaw, repoRoot) : "";
  if (!filepath) return null;
  const repoPathRaw = (location.repoPath ?? location.repo_path) as unknown;
  const repoPath = typeof repoPathRaw === "string" ? repoPathRaw.trim() : "";
  const startLine = parsePositiveInt(
    location.startLine ?? location.start_line ?? location.line ?? location.start
  );
  const endLine = parsePositiveInt(
    location.endLine ?? location.end_line ?? location.lineEnd ?? location.end
  );
  return {
    filepath,
    repoPath,
    startLine,
    endLine: endLine ?? startLine
  };
}

function extractRepoFullNameFromFinding(finding: {
  repositoryFullName?: string | null;
  repoFullName?: string | null;
  location?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
}): string {
  const details = toRecord(finding.details);
  const location = toRecord(finding.location);
  const direct = finding.repositoryFullName ?? finding.repoFullName;
  const candidates = [
    direct,
    location.repoFullName,
    location.repositoryFullName,
    details.repoFullName,
    details.repositoryFullName
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function coerceStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return [];
}

function extractRawEdges(callGraph: JellyCallGraph): unknown {
  if (callGraph.edges) return callGraph.edges;
  if (callGraph.calls) return callGraph.calls;
  const nested = (callGraph.callgraph ?? callGraph.callGraph) as Record<string, unknown> | null;
  if (nested && typeof nested === "object") {
    if (nested.edges) return nested.edges;
    if (nested.calls) return nested.calls;
  }
  return null;
}

function coerceEdgePairs(raw: unknown): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (Array.isArray(entry) && entry.length >= 2) {
        pairs.push([String(entry[0]), String(entry[1])]);
        continue;
      }
      if (isPlainObject(entry)) {
        const from =
          (entry as any).from ??
          (entry as any).caller ??
          (entry as any).source ??
          (entry as any).src;
        const to =
          (entry as any).to ??
          (entry as any).callee ??
          (entry as any).target ??
          (entry as any).dst;
        if (from != null && to != null) {
          pairs.push([String(from), String(to)]);
        }
      }
    }
    return pairs;
  }
  if (isPlainObject(raw)) {
    for (const [key, value] of Object.entries(raw)) {
      if (Array.isArray(value)) {
        for (const target of value) {
          if (target == null) continue;
          pairs.push([String(key), String(target)]);
        }
        continue;
      }
      if (isPlainObject(value) && Array.isArray((value as any).calls)) {
        for (const target of (value as any).calls) {
          if (target == null) continue;
          pairs.push([String(key), String(target)]);
        }
      }
    }
  }
  return pairs;
}

function parseLocationJson(value: string): {
  fileIndex: number;
  startLine: number | null;
  startColumn: number | null;
  endLine: number | null;
  endColumn: number | null;
} | null {
  const match = /^(\d+):(\d+|\?):(\d+|\?):(\d+|\?):(\d+|\?)/.exec(value);
  if (!match) return null;
  const fileIndex = Number(match[1]);
  const startLine = match[2] === "?" ? null : Number(match[2]);
  const startColumn = match[3] === "?" ? null : Number(match[3]);
  const endLine = match[4] === "?" ? null : Number(match[4]);
  const endColumn = match[5] === "?" ? null : Number(match[5]);
  return { fileIndex, startLine, startColumn, endLine, endColumn };
}

function buildAnchorIndex(callGraph: JellyCallGraph, repoRoot: string): AnchorIndex | null {
  const files = coerceStringArray(callGraph.files);
  if (files.length === 0) return null;

  const rawFunctions = callGraph.functions;
  const entries: Array<[string, string]> = [];
  if (Array.isArray(rawFunctions)) {
    rawFunctions.forEach((loc, idx) => {
      if (typeof loc === "string") entries.push([String(idx), loc]);
    });
  } else if (isPlainObject(rawFunctions)) {
    for (const [key, loc] of Object.entries(rawFunctions)) {
      if (typeof loc === "string") entries.push([key, loc]);
    }
  }

  if (entries.length === 0) return null;

  const anchorsByFile = new Map<string, AnchorNode[]>();
  const functionById = new Map<string, JellyFunctionNode>();
  const anchorIdByFunctionId = new Map<string, string>();
  const functionIdByAnchorId = new Map<string, string>();
  let anchorCount = 0;

  for (const [idx, loc] of entries) {
    const parsed = parseLocationJson(loc);
    if (!parsed) continue;
    if (parsed.startLine === null || parsed.endLine === null) {
      continue;
    }
    if (parsed.startLine <= 0 || parsed.endLine <= 0) {
      continue;
    }
    const filePathRaw = files[parsed.fileIndex] ?? "";
    const filePath = normalizePath(filePathRaw);
    if (!filePath) continue;
    const startColumn = parsed.startColumn ?? 0;
    const endColumn = parsed.endColumn ?? 0;
    const anchorId = `jelly:${filePath}:${parsed.startLine}:${startColumn}:${parsed.endLine}:${endColumn}`;
    const anchor: AnchorNode = {
      id: anchorId,
      filePath,
      startLine: parsed.startLine,
      endLine: parsed.endLine,
      startColumn,
      endColumn,
      isModule: parsed.startLine === 1 && startColumn === 0
    };
    if (!anchorsByFile.has(filePath)) {
      anchorsByFile.set(filePath, []);
    }
    anchorsByFile.get(filePath)!.push(anchor);
    const functionNode: JellyFunctionNode = {
      id: idx,
      filePath,
      startLine: parsed.startLine,
      endLine: parsed.endLine,
      startColumn,
      endColumn,
      anchorId
    };
    functionById.set(idx, functionNode);
    anchorIdByFunctionId.set(idx, anchorId);
    if (!functionIdByAnchorId.has(anchorId)) {
      functionIdByAnchorId.set(anchorId, idx);
    }
    anchorCount += 1;
  }

  if (anchorCount === 0) return null;

  for (const anchors of anchorsByFile.values()) {
    anchors.sort((a, b) => {
      if (a.startLine !== b.startLine) return a.startLine - b.startLine;
      if (a.endLine !== b.endLine) return b.endLine - a.endLine;
      if (a.startColumn !== b.startColumn) return a.startColumn - b.startColumn;
      return a.endColumn - b.endColumn;
    });
  }

  const callGraphIndex = buildCallGraphIndex({
    callGraph,
    functionById,
    anchorIdByFunctionId,
    functionIdByAnchorId
  });

  return createAnchorIndex({
    repoRoot,
    anchorCount,
    anchorsByFile,
    callGraph: callGraphIndex
  });
}

function createAnchorIndex(params: {
  repoRoot: string;
  anchorCount: number;
  anchorsByFile: Map<string, AnchorNode[]>;
  callGraph?: JellyCallGraphIndex | null;
}): AnchorIndex {
  const { repoRoot, anchorsByFile, anchorCount } = params;
  const fileCount = anchorsByFile.size;

  const getAnchorId = (lookup: AnchorLookup): string | null => {
    if (!lookup.filepath) return null;
    const startLine = lookup.startLine ?? null;
    const endLine = lookup.endLine ?? startLine;
    if (!startLine || startLine <= 0) return null;
    if (!endLine || endLine <= 0) return null;

    const repoPath = lookup.repoPath ?? "";
    const canonicalPath = canonicalizeFilePath(repoPath, lookup.filepath);
    const anchors = anchorsByFile.get(canonicalPath);
    if (!anchors || anchors.length === 0) return null;

    const targetStart = Math.min(startLine, endLine);
    const targetEnd = Math.max(startLine, endLine);

    let best: AnchorNode | null = null;
    let bestRange = Infinity;
    let bestColumnSpan = Infinity;

    for (const anchor of anchors) {
      if (anchor.startLine > targetStart) continue;
      if (anchor.endLine < targetEnd) continue;
      const range = anchor.endLine - anchor.startLine;
      const columnSpan = anchor.endColumn - anchor.startColumn;
      if (range < bestRange) {
        best = anchor;
        bestRange = range;
        bestColumnSpan = columnSpan;
        continue;
      }
      if (range === bestRange) {
        if (columnSpan < bestColumnSpan) {
          best = anchor;
          bestColumnSpan = columnSpan;
          continue;
        }
        if (columnSpan === bestColumnSpan && best?.isModule && !anchor.isModule) {
          best = anchor;
        }
      }
    }

    return best?.id ?? null;
  };

  const getAnchorsForFile = (lookup: { filepath: string; repoPath?: string | null }): JellyAnchorNode[] => {
    if (!lookup.filepath) return [];
    const normalized = normalizeFilepathForRepo(lookup.filepath, repoRoot);
    if (!normalized) return [];
    const repoPath = lookup.repoPath ?? "";
    const canonicalPath = canonicalizeFilePath(repoPath, normalized);
    const anchors = anchorsByFile.get(canonicalPath) ?? anchorsByFile.get(normalized);
    if (!anchors || anchors.length === 0) return [];
    return anchors.map((anchor) => ({
      anchorId: anchor.id,
      filePath: anchor.filePath,
      startLine: anchor.startLine,
      endLine: anchor.endLine,
      startColumn: anchor.startColumn,
      endColumn: anchor.endColumn
    }));
  };

  return {
    repoRoot,
    anchorCount,
    fileCount,
    getAnchorId,
    getAnchorsForFile,
    callGraph: params.callGraph ?? null
  };
}

function buildCallGraphIndex(params: {
  callGraph: JellyCallGraph;
  functionById: Map<string, JellyFunctionNode>;
  anchorIdByFunctionId: Map<string, string>;
  functionIdByAnchorId: Map<string, string>;
}): JellyCallGraphIndex | null {
  if (params.functionById.size === 0) return null;
  const rawEdges = extractRawEdges(params.callGraph);
  const edgePairs = coerceEdgePairs(rawEdges);
  const callerSetMap = new Map<string, Set<string>>();
  const calleeSetMap = new Map<string, Set<string>>();
  for (const [from, to] of edgePairs) {
    if (!params.functionById.has(from) || !params.functionById.has(to)) {
      continue;
    }
    if (!callerSetMap.has(from)) {
      callerSetMap.set(from, new Set());
    }
    callerSetMap.get(from)!.add(to);
    if (!calleeSetMap.has(to)) {
      calleeSetMap.set(to, new Set());
    }
    calleeSetMap.get(to)!.add(from);
  }

  const edgesByCaller = new Map<string, string[]>();
  for (const [caller, targets] of callerSetMap.entries()) {
    edgesByCaller.set(caller, Array.from(targets));
  }
  const edgesByCallee = new Map<string, string[]>();
  for (const [callee, callers] of calleeSetMap.entries()) {
    edgesByCallee.set(callee, Array.from(callers));
  }

  return {
    functionById: params.functionById,
    anchorIdByFunctionId: params.anchorIdByFunctionId,
    functionIdByAnchorId: params.functionIdByAnchorId,
    edgesByCaller,
    edgesByCallee
  };
}

async function hasConfigFile(scanRoot: string): Promise<boolean> {
  for (const filename of CONFIG_FILENAMES) {
    try {
      const candidate = path.join(scanRoot, filename);
      const stats = await stat(candidate);
      if (stats.isFile()) return true;
    } catch {
      // ignore
    }
  }
  return false;
}

async function repoLooksJsTs(scanRoot: string): Promise<boolean> {
  if (await hasConfigFile(scanRoot)) return true;

  const queue: Array<{ dir: string; depth: number }> = [{ dir: scanRoot, depth: 0 }];
  let scanned = 0;

  while (queue.length > 0 && scanned < MAX_SCAN_ENTRIES) {
    const { dir, depth } = queue.pop()!;
    let entries: Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (scanned >= MAX_SCAN_ENTRIES) break;
      scanned += 1;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (depth < MAX_SCAN_DEPTH) {
          queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (JS_TS_EXTENSIONS.has(ext)) {
        return true;
      }
    }
  }
  return false;
}

function buildCacheKey(params: { repoRoot: string; commitSha?: string | null }): string {
  const sha = typeof params.commitSha === "string" ? params.commitSha.trim() : "";
  return `${params.repoRoot}::${sha}`;
}

export async function computeJellyAnchors(params: {
  repoRoot: string;
  scanRoot: string;
  commitSha?: string | null;
  timeoutSeconds?: number;
}): Promise<JellyAnchorComputation> {
  const key = buildCacheKey(params);
  if (anchorCache.has(key)) {
    return anchorCache.get(key)!;
  }

  const promise = (async (): Promise<JellyAnchorComputation> => {
    const startedAt = Date.now();

    const looksJs = await repoLooksJsTs(params.scanRoot);
    if (!looksJs) {
      return {
        index: null,
        ran: false,
        durationMs: Date.now() - startedAt,
        reason: "repo_not_js_ts"
      };
    }

    const available = await isJellyAvailable();
    if (!available) {
      return {
        index: null,
        ran: false,
        durationMs: Date.now() - startedAt,
        reason: "jelly_unavailable"
      };
    }

    let tmpDir: string | null = null;
    try {
      tmpDir = await mkdtemp(path.join(tmpdir(), "jelly-"));
      const outputPath = path.join(tmpDir, "callgraph.json");
      const runResult = await runJellyCallGraph({
        repoRoot: params.repoRoot,
        scanRoot: params.scanRoot,
        outputPath,
        timeoutSeconds: params.timeoutSeconds ?? JELLY_TIMEOUT_SECONDS
      });

      if (runResult.exitCode !== 0) {
        return {
          index: null,
          ran: true,
          durationMs: Date.now() - startedAt,
          reason: "jelly_nonzero_exit",
          error: formatJellyRunError(runResult)
        };
      }

      const raw = await readFile(outputPath, "utf-8");
      const json = JSON.parse(raw || "{}") as JellyCallGraph;
      const index = buildAnchorIndex(json, params.repoRoot);
      if (!index) {
        return {
          index: null,
          ran: true,
          durationMs: Date.now() - startedAt,
          reason: "jelly_output_empty"
        };
      }

      return {
        index,
        ran: true,
        durationMs: Date.now() - startedAt
      };
    } catch (err) {
      return {
        index: null,
        ran: true,
        durationMs: Date.now() - startedAt,
        reason: "jelly_failed",
        error: (err as Error)?.message ?? String(err)
      };
    } finally {
      if (tmpDir) {
        await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  })();

  anchorCache.set(key, promise);
  return promise;
}

export function attachJellyAnchors<
  T extends { location?: Record<string, unknown> | null; details?: Record<string, unknown> | null }
>(findings: T[], anchorIndex: AnchorIndex): { anchored: number; total: number } {
  let anchored = 0;
  for (const finding of findings) {
    const details = toRecord(finding.details);
    const existingAnchor =
      typeof details.anchorNodeId === "string"
        ? details.anchorNodeId
        : typeof (details as any).anchor_node_id === "string"
          ? (details as any).anchor_node_id
          : "";
    if (existingAnchor) continue;

    const location = extractFindingLocation(finding, anchorIndex.repoRoot);
    if (!location) continue;
    const anchorId = anchorIndex.getAnchorId({
      filepath: location.filepath,
      repoPath: location.repoPath,
      startLine: location.startLine,
      endLine: location.endLine
    });
    if (!anchorId) continue;
    details.anchorNodeId = anchorId;
    if (!finding.details) {
      (finding as any).details = details;
    }
    anchored += 1;
  }
  return { anchored, total: findings.length };
}

export function attachJellyAnchorsByRepo<
  T extends {
    repositoryFullName?: string | null;
    repoFullName?: string | null;
    location?: Record<string, unknown> | null;
    details?: Record<string, unknown> | null;
  }
>(
  findings: T[],
  anchorIndexesByRepo: Map<string, AnchorIndex>
): { anchored: number; total: number; repoStats: Array<{ repoFullName: string; anchored: number; total: number }> } {
  let anchored = 0;
  const repoStats = new Map<string, { anchored: number; total: number }>();

  for (const finding of findings) {
    const repoFullName = extractRepoFullNameFromFinding(finding);
    if (!repoFullName) continue;
    const repoKey = repoFullName.toLowerCase();
    const anchorIndex = anchorIndexesByRepo.get(repoKey);
    if (!anchorIndex) continue;
    const details = toRecord(finding.details);
    const existingAnchor =
      typeof details.anchorNodeId === "string"
        ? details.anchorNodeId
        : typeof (details as any).anchor_node_id === "string"
          ? (details as any).anchor_node_id
          : "";
    if (existingAnchor) continue;
    const location = extractFindingLocation(finding, anchorIndex.repoRoot);
    if (!location) continue;
    const anchorId = anchorIndex.getAnchorId({
      filepath: location.filepath,
      repoPath: location.repoPath,
      startLine: location.startLine,
      endLine: location.endLine
    });
    if (!anchorId) continue;
    details.anchorNodeId = anchorId;
    if (!finding.details) {
      (finding as any).details = details;
    }
    anchored += 1;
    if (!repoStats.has(repoFullName)) {
      repoStats.set(repoFullName, { anchored: 0, total: 0 });
    }
    repoStats.get(repoFullName)!.anchored += 1;
  }

  for (const finding of findings) {
    const repoFullName = extractRepoFullNameFromFinding(finding);
    if (!repoFullName) continue;
    if (!repoStats.has(repoFullName)) {
      repoStats.set(repoFullName, { anchored: 0, total: 0 });
    }
    repoStats.get(repoFullName)!.total += 1;
  }

  return {
    anchored,
    total: findings.length,
    repoStats: Array.from(repoStats.entries()).map(([repoFullName, stats]) => ({
      repoFullName,
      anchored: stats.anchored,
      total: stats.total
    }))
  };
}
