import { createWriteStream, statSync } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import type { HadrixConfig } from "../config/loadConfig.js";
import { loadConfig } from "../config/loadConfig.js";
import { isCompositeScanEnabled } from "../config/featureFlags.js";
import { discoverFiles } from "../fs/discover.js";
import { hashFile, toRelative } from "../chunking/chunker.js";
import { securityChunkFile } from "../chunking/securityChunker.js";
import { HadrixDb } from "../storage/db.js";
// embeddings removed
import { buildRepositoryFileSamples, toLocalChunk } from "./chunkSampling.js";
import { reduceRepositoryFindings, scanRepository, scanRepositoryComposites } from "./repositoryScanner.js";
import { runStaticScanners } from "./staticScanners.js";
import { inferRepoPathFromDisk, normalizeRepoPath } from "./repoPath.js";
import { attachJellyAnchors, computeJellyAnchors } from "./jellyAnchors.js";
import { isJellyAvailable } from "./jelly.js";
import { discoverEntryPoints } from "./entryPoints.js";
import { buildJellyReachabilityIndex } from "./jellyReachability.js";
import { buildFindingIdentityKey, buildFindingIdentityKeyV2 } from "./dedupeKey.js";
import { runSupabaseSchemaScan } from "../supabase/supabaseSchemaScan.js";
import { ProviderRequestFailedError } from "../errors/provider.errors.js";
import { clearScanResumeState, createScanResumeStore } from "./scanResume.js";
import type { ScanResumeStore } from "./scanResume.js";
import {
  dedupeFindings,
  dedupeRepositoryFindingsAgainstExisting,
  dropRepositorySummaryDuplicates,
  filterFindings,
  inferFindingCategory,
  normalizeRepositoryFinding
} from "./post/postProcessing.js";
import type { AnchorIndex, JellyAnchorComputation } from "./jellyAnchors.js";
import type { ReachabilityIndex } from "./jellyReachability.js";
import type {
  CoreFinding,
  ExistingScanFinding,
  Finding,
  RepositoryFileSample,
  RepositoryScanFinding,
  ScanResult,
  StaticFinding
} from "../types.js";
import type { DedupeDebug } from "./debugLog.js";
import type { ScanProgressHandler } from "./progress.js";

export interface RunScanOptions {
  projectRoot: string;
  configPath?: string | null;
  overrides?: Partial<HadrixConfig>;
  powerMode?: boolean;
  repoPath?: string | null;
  inferRepoPath?: boolean;
  skipStatic?: boolean;
  existingFindings?: ExistingScanFinding[];
  repoFullName?: string | null;
  repositoryId?: string | null;
  commitSha?: string | null;
  logger?: (message: string) => void;
  progress?: ScanProgressHandler;
  debug?: boolean;
  debugLogPath?: string | null;
  supabase?: { connectionString?: string; schemaSnapshotPath?: string; useCli?: boolean } | null;
  resume?: "off" | "new" | "resume";
}

type ChunkRow = {
  id: number;
  filepath: string;
  chunk_index: number;
  start_line: number;
  end_line: number;
  content: string;
  chunk_format?: string | null;
  overlap_group_id?: string | null;
};

type DebugLogWriter = {
  log: (event: Record<string, unknown>) => void;
  close: () => Promise<void>;
  path: string;
};

async function createDebugLogWriter(params: {
  enabled: boolean;
  requestedPath?: string | null;
  stateDir: string;
  log: (message: string) => void;
}): Promise<DebugLogWriter | null> {
  if (!params.enabled) return null;
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  let filePath: string;
  if (params.requestedPath) {
    const resolvedPath = path.isAbsolute(params.requestedPath)
      ? params.requestedPath
      : path.resolve(process.cwd(), params.requestedPath);
    const endsWithSeparator =
      resolvedPath.endsWith(path.sep) || resolvedPath.endsWith("/") || resolvedPath.endsWith("\\");
    if (endsWithSeparator) {
      filePath = path.join(resolvedPath, `scan-debug-${timestamp}.jsonl`);
    } else {
      const stats = await stat(resolvedPath).catch(() => null);
      filePath = stats?.isDirectory()
        ? path.join(resolvedPath, `scan-debug-${timestamp}.jsonl`)
        : resolvedPath;
    }
  } else {
    filePath = path.join(params.stateDir, "logs", `scan-debug-${timestamp}.jsonl`);
  }

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    const stream = createWriteStream(filePath, { flags: "a" });
    stream.on("error", (err) => {
      params.log(`Debug log error: ${err.message}`);
    });
    const log = (event: Record<string, unknown>) => {
      const payload = { timestamp: new Date().toISOString(), ...event };
      stream.write(`${JSON.stringify(payload)}\n`);
    };
    const close = () =>
      new Promise<void>((resolve) => {
        stream.end(() => resolve());
      });
    const relative = path.relative(process.cwd(), filePath);
    params.log(
      `Debug log enabled: ${relative && !relative.startsWith("..") ? relative : filePath}.`
    );
    return { log, close, path: filePath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    params.log(`Failed to create debug log: ${message}`);
    return null;
  }
}

// embeddings removed

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function buildRepoSnapshot(entries: string[]): { hash: string; fileCount: number } | null {
  if (entries.length === 0) return null;
  const sorted = [...entries].sort();
  const hasher = crypto.createHash("sha256");
  for (const entry of sorted) {
    hasher.update(entry);
    hasher.update("\n");
  }
  return { hash: hasher.digest("hex"), fileCount: sorted.length };
}

function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\/*/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

function normalizeLineNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return Math.trunc(parsed);
    }
  }
  return fallback;
}

function parseChunkIndex(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function findChunkForLine(chunks: ChunkRow[], filepath: string, line: number): ChunkRow | null {
  const normalized = normalizePath(filepath);
  if (!normalized) return null;
  for (const chunk of chunks) {
    if (normalizePath(chunk.filepath) !== normalized) continue;
    if (chunk.start_line <= line && line <= chunk.end_line) {
      return chunk;
    }
  }
  return null;
}

function findChunkForIndex(
  chunks: ChunkRow[],
  filepath: string,
  chunkIndex: number
): ChunkRow | null {
  const normalized = normalizePath(filepath);
  if (!normalized) return null;
  for (const chunk of chunks) {
    if (normalizePath(chunk.filepath) !== normalized) continue;
    if (chunk.chunk_index === chunkIndex) {
      return chunk;
    }
  }
  return null;
}

function extractLocationFilepath(location: Record<string, unknown>): string {
  const raw = (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  return typeof raw === "string" ? raw : "";
}

function buildCoreLocation(params: {
  filepath?: string | null;
  startLine?: number | null;
  endLine?: number | null;
  repoPath?: string | null;
  repoFullName?: string | null;
  commitSha?: string | null;
  chunkIndex?: number | null;
  chunkId?: number | null;
}): Record<string, unknown> | null {
  const location: Record<string, unknown> = {};
  if (params.filepath) location.filepath = params.filepath;
  if (typeof params.startLine === "number") location.startLine = params.startLine;
  if (typeof params.endLine === "number") location.endLine = params.endLine;
  if (params.repoPath) location.repoPath = params.repoPath;
  if (params.repoFullName) location.repoFullName = params.repoFullName;
  if (params.commitSha) location.commitSha = params.commitSha;
  if (typeof params.chunkIndex === "number") location.chunkIndex = params.chunkIndex;
  if (typeof params.chunkId === "number") location.chunkId = params.chunkId;
  return Object.keys(location).length ? location : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function toStringArray(value: unknown): string[] {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? [trimmed] : [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
  }
  return [];
}

function mergeStringArrays(...lists: string[][]): string[] {
  const merged = new Set<string>();
  for (const list of lists) {
    for (const item of list) {
      const trimmed = item.trim();
      if (trimmed) {
        merged.add(trimmed);
      }
    }
  }
  return Array.from(merged);
}

function applyFindingIdentityKey<T extends { details?: Record<string, unknown> | null }>(
  finding: T,
  fallbackRepoPath?: string | null
): T {
  const details = { ...toRecord(finding.details) };
  const existingIdentityKey =
    typeof details.identityKey === "string" ? details.identityKey.trim() : "";
  const existingDedupeKey =
    typeof details.dedupeKey === "string" ? details.dedupeKey.trim() : "";

  if (existingIdentityKey) {
    details.identityKey = existingIdentityKey;
  }
  if (existingDedupeKey) {
    details.dedupeKey = existingDedupeKey;
  }
  if (existingIdentityKey && !existingDedupeKey) {
    details.dedupeKey = existingIdentityKey;
  }
  if (existingDedupeKey && !existingIdentityKey) {
    details.identityKey = existingDedupeKey;
  }
  if (!existingIdentityKey && !existingDedupeKey) {
    const identityKey = buildFindingIdentityKey(finding as any, {
      fallbackRepoPath: fallbackRepoPath ?? null
    });
    if (identityKey) {
      details.dedupeKey = identityKey;
      details.identityKey = identityKey;
    }
  }

  const existingIdentityKeyV2 =
    typeof (details as any).identityKeyV2 === "string"
      ? ((details as any).identityKeyV2 as string).trim()
      : typeof (details as any).identity_key_v2 === "string"
        ? ((details as any).identity_key_v2 as string).trim()
        : "";
  if (existingIdentityKeyV2) {
    (details as any).identityKeyV2 = existingIdentityKeyV2;
  }
  const computedIdentityKeyV2 = buildFindingIdentityKeyV2(finding as any, {
    fallbackRepoPath: fallbackRepoPath ?? null
  });
  if (computedIdentityKeyV2 && computedIdentityKeyV2 !== existingIdentityKeyV2) {
    (details as any).identityKeyV2 = computedIdentityKeyV2;
  }

  return { ...finding, details };
}

type DedupeReport = {
  totalFindings: number;
  uniqueByLocation: number;
  exactDuplicates: number;
  mergedCount: number;
  duplicatesBySource: Record<string, number>;
  duplicatesByRule: Record<string, number>;
  duplicatesByCategory: Record<string, number>;
  missingAnchorPercent: number;
  missingOverlapPercent: number;
};

type JellyAnchorsReport = {
  enabled: boolean;
  skipped: boolean;
  ran: boolean;
  reason?: string;
  error?: string;
  durationMs?: number;
  anchorCount: number | null;
  fileCount: number | null;
  repoRoot: string;
  scanRoot: string;
  repoPath: string | null;
  commitSha: string | null;
};

function parseLineNumberForReport(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.trunc(parsed);
    }
  }
  return null;
}

function buildLocationKeyForReport(finding: {
  location?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
}): string {
  const location = toRecord(finding.location);
  const details = toRecord(finding.details);
  const repoPathRaw = location.repoPath ?? location.repo_path ?? details.repoPath ?? details.repo_path;
  const repoPath = normalizeRepoPath(typeof repoPathRaw === "string" ? repoPathRaw : "");
  const filepathRaw =
    (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  let filepath = typeof filepathRaw === "string" ? normalizePath(filepathRaw) : "";
  if (repoPath && filepath && !filepath.startsWith(`${repoPath}/`) && filepath !== repoPath) {
    filepath = `${repoPath}/${filepath}`.replace(/\/+/g, "/");
  }
  if (!filepath) return "";

  const startLine = parseLineNumberForReport(
    location.startLine ?? location.start_line ?? location.line ?? location.start
  );
  const endLine = parseLineNumberForReport(
    location.endLine ?? location.end_line ?? location.lineEnd ?? location.end
  );
  const chunkIndex = parseChunkIndex(
    (location as any).chunkIndex ?? (location as any).chunk_index
  );
  let anchor = "unknown";
  if (startLine !== null || endLine !== null) {
    const start = startLine ?? endLine ?? 0;
    let end = endLine ?? start;
    if (end < start) end = start;
    anchor = `lines:${start}-${end}`;
  } else if (chunkIndex !== null) {
    anchor = `chunk:${chunkIndex}`;
  }

  return `${filepath}|${anchor}`;
}

function formatCountMap(values: Record<string, number>): string {
  return Object.entries(values)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => `${key}: ${count}`)
    .join(", ");
}

function buildJellyAnchorsReport(params: {
  enabled: boolean;
  skipped: boolean;
  repoRoot: string;
  scanRoot: string;
  repoPath: string | null;
  commitSha: string | null;
  result?: JellyAnchorComputation | null;
  index?: AnchorIndex | null;
}): JellyAnchorsReport {
  let ran = false;
  let reason = "";
  let error: string | undefined;
  let durationMs: number | undefined;

  if (!params.enabled) {
    reason = "disabled";
  } else if (params.skipped) {
    reason = "skipped";
  }

  if (params.result) {
    ran = params.result.ran;
    durationMs = params.result.durationMs;
    if (params.result.reason) {
      reason = params.result.reason;
    }
    if (params.result.error) {
      error = params.result.error;
    }
  }

  const report: JellyAnchorsReport = {
    enabled: params.enabled,
    skipped: params.skipped,
    ran,
    anchorCount: params.index ? params.index.anchorCount : null,
    fileCount: params.index ? params.index.fileCount : null,
    repoRoot: params.repoRoot,
    scanRoot: params.scanRoot,
    repoPath: params.repoPath,
    commitSha: params.commitSha
  };
  if (reason) report.reason = reason;
  if (error) report.error = error;
  if (typeof durationMs === "number") report.durationMs = durationMs;
  return report;
}

function buildDedupeReport(rawFindings: CoreFinding[], finalCount: number): DedupeReport {
  const totalFindings = rawFindings.length;
  const byLocation = new Map<string, CoreFinding[]>();
  const byExact = new Map<string, CoreFinding[]>();
  let missingAnchors = 0;
  let missingOverlap = 0;

  for (const finding of rawFindings) {
    const locationKey = buildLocationKeyForReport(finding);
    if (locationKey) {
      const existing = byLocation.get(locationKey);
      if (existing) {
        existing.push(finding);
      } else {
        byLocation.set(locationKey, [finding]);
      }
      const summary = typeof finding.summary === "string" ? finding.summary.trim() : "";
      if (summary) {
        const exactKey = `${locationKey}|${summary}`;
        const exactExisting = byExact.get(exactKey);
        if (exactExisting) {
          exactExisting.push(finding);
        } else {
          byExact.set(exactKey, [finding]);
        }
      }
    }

    const details = toRecord(finding.details);
    const anchor =
      details.anchorNodeId ?? details.anchor_node_id ?? details.anchorId ?? details.anchor_id;
    const overlap =
      details.overlapGroupId ??
      details.overlap_group_id ??
      details.overlapId ??
      details.overlap_id;
    if (typeof anchor !== "string" || !anchor.trim()) missingAnchors += 1;
    if (typeof overlap !== "string" || !overlap.trim()) missingOverlap += 1;
  }

  let exactDuplicates = 0;
  const duplicatesBySource: Record<string, number> = {};
  const duplicatesByRule: Record<string, number> = {};
  const duplicatesByCategory: Record<string, number> = {};

  for (const group of byExact.values()) {
    if (group.length <= 1) continue;
    exactDuplicates += group.length - 1;
    for (let i = 1; i < group.length; i += 1) {
      const finding = group[i]!;
      const source = finding.source ?? "unknown";
      duplicatesBySource[source] = (duplicatesBySource[source] ?? 0) + 1;
      const details = toRecord(finding.details);
      const ruleIdRaw =
        details.ruleId ??
        details.rule_id ??
        details.ruleID ??
        details.findingType ??
        details.finding_type;
      const ruleId = typeof ruleIdRaw === "string" ? ruleIdRaw.trim() : "";
      if (ruleId) {
        duplicatesByRule[ruleId] = (duplicatesByRule[ruleId] ?? 0) + 1;
      }
      const categoryRaw = finding.category ?? details.category ?? details.findingCategory ?? details.finding_category;
      const category = typeof categoryRaw === "string" ? categoryRaw.trim() : "";
      if (category) {
        duplicatesByCategory[category] = (duplicatesByCategory[category] ?? 0) + 1;
      }
    }
  }

  const mergedCount = Math.max(0, totalFindings - finalCount);
  const missingAnchorPercent = totalFindings ? (missingAnchors / totalFindings) * 100 : 0;
  const missingOverlapPercent = totalFindings ? (missingOverlap / totalFindings) * 100 : 0;

  return {
    totalFindings,
    uniqueByLocation: byLocation.size,
    exactDuplicates,
    mergedCount,
    duplicatesBySource,
    duplicatesByRule,
    duplicatesByCategory,
    missingAnchorPercent,
    missingOverlapPercent
  };
}

async function writeDedupeReport(
  stateDir: string,
  report: DedupeReport,
  log: (message: string) => void
): Promise<void> {
  const dir = path.join(stateDir, "reports");
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `dedupe-report-${timestamp}.json`;
  const filePath = path.join(dir, filename);
  await writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");
  const relative = path.relative(process.cwd(), filePath);
  log(
    `Dedupe report saved to ${relative && !relative.startsWith("..") ? relative : filePath}.`
  );
}

async function writeJellyAnchorsReport(
  stateDir: string,
  report: JellyAnchorsReport,
  log: (message: string) => void
): Promise<void> {
  const dir = path.join(stateDir, "reports");
  await mkdir(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `jelly-anchors-report-${timestamp}.json`;
  const filePath = path.join(dir, filename);
  await writeFile(filePath, JSON.stringify(report, null, 2), "utf-8");
  const relative = path.relative(process.cwd(), filePath);
  log(
    `Jelly anchors report saved to ${relative && !relative.startsWith("..") ? relative : filePath}.`
  );
}

function normalizeLocation(
  location: Record<string, unknown> | null,
  fallbackPath: string,
  fallbackRepoPath?: string | null
): { filepath: string; startLine: number; endLine: number; repoPath?: string } {
  const record = toRecord(location);
  const filepathRaw = (record.filepath ?? record.filePath ?? record.path ?? record.file) as unknown;
  let filepath = typeof filepathRaw === "string" ? normalizePath(filepathRaw) : "";
  const repoPathRaw = (record.repoPath ?? record.repo_path) as unknown;
  const normalizedRepoPath = normalizeRepoPath(
    typeof repoPathRaw === "string" ? repoPathRaw : fallbackRepoPath ?? ""
  );
  if (normalizedRepoPath && filepath && !filepath.startsWith(`${normalizedRepoPath}/`) && filepath !== normalizedRepoPath) {
    filepath = `${normalizedRepoPath}/${filepath}`.replace(/\/+/g, "/");
  }
  const safePath = filepath || normalizePath(fallbackPath) || "(repository)";
  const startLine = normalizeLineNumber(
    record.startLine ?? record.start_line ?? record.line ?? record.start,
    1
  );
  const endLine = normalizeLineNumber(
    record.endLine ?? record.end_line ?? record.lineEnd ?? record.end,
    startLine
  );
  const normalized: {
    filepath: string;
    startLine: number;
    endLine: number;
    repoPath?: string;
  } = {
    filepath: safePath,
    startLine,
    endLine: endLine < startLine ? startLine : endLine
  };
  if (normalizedRepoPath) {
    normalized.repoPath = normalizedRepoPath;
  }
  return normalized;
}

function resolveScanRoot(
  repoRoot: string,
  repoPath?: string | null
): { scanRoot: string; repoPath: string | null; missing?: string } {
  const normalized = normalizeRepoPath(repoPath ?? "");
  if (!normalized) {
    return { scanRoot: repoRoot, repoPath: null };
  }
  const candidate = path.join(repoRoot, normalized);
  try {
    const stats = statSync(candidate);
    if (stats.isDirectory()) {
      return { scanRoot: candidate, repoPath: normalized };
    }
  } catch {
    // Fall back to repo root when the repoPath doesn't exist.
  }
  return { scanRoot: repoRoot, repoPath: null, missing: normalized };
}

function toExistingFindings(
  staticFindings: StaticFinding[],
  repoPath?: string | null,
  repoFullName?: string | null,
  repositoryId?: string | null
): ExistingScanFinding[] {
  const normalizedRepoPath = normalizeRepoPath(repoPath ?? "");
  return staticFindings.map((finding) => {
    const filepath = normalizePath(finding.filepath);
    const location: { filepath: string; startLine: number; endLine: number; repoPath?: string } = {
      filepath,
      startLine: finding.startLine,
      endLine: finding.endLine
    };
    if (normalizedRepoPath && (filepath === normalizedRepoPath || filepath.startsWith(`${normalizedRepoPath}/`))) {
      location.repoPath = normalizedRepoPath;
    }
    const source = `static_${finding.tool}`;
    const details: Record<string, unknown> = {
      ...toRecord(finding.details),
      tool: source,
      ruleId: finding.ruleId,
      snippet: finding.snippet ?? null
    };
    if (repoFullName) details.repoFullName = repoFullName;
    if (normalizedRepoPath) details.repoPath = normalizedRepoPath;
    if (repositoryId) details.repositoryId = repositoryId;
    return {
      repositoryId: repositoryId ?? undefined,
      repositoryFullName: repoFullName ?? undefined,
      type: null,
      source,
      severity: finding.severity,
      summary: finding.message,
      location,
      details
    };
  });
}

function normalizeExistingFindings(
  findings: ExistingScanFinding[] | undefined,
  params: { repoFullName?: string | null; repositoryId?: string | null; repoPath?: string | null }
): ExistingScanFinding[] {
  if (!findings || findings.length === 0) {
    return [];
  }
  return findings.map((finding) => {
    const location = toRecord(finding.location);
    const nextLocation: Record<string, unknown> = { ...location };
    if (params.repoPath && nextLocation.repoPath == null && (nextLocation as any).repo_path == null) {
      nextLocation.repoPath = params.repoPath;
    }
    return {
      ...finding,
      repositoryId: finding.repositoryId ?? params.repositoryId ?? undefined,
      repositoryFullName: finding.repositoryFullName ?? params.repoFullName ?? undefined,
      location: Object.keys(nextLocation).length ? nextLocation : finding.location ?? null
    };
  });
}

function normalizeStaticTool(value: unknown): StaticFinding["tool"] | null {
  if (typeof value !== "string") return null;
  let normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith("static_")) {
    normalized = normalized.slice("static_".length);
  }
  if (normalized === "osv") normalized = "osv-scanner";
  if (normalized === "gitleaks") return "gitleaks";
  if (normalized === "osv-scanner") return "osv-scanner";
  if (normalized === "eslint") return "eslint";
  if (normalized === "supabase") return "supabase";
  return null;
}

function toStaticFindingFromExisting(finding: ExistingScanFinding): StaticFinding | null {
  const location = toRecord(finding.location);
  const filepathRaw =
    (location.filepath ?? location.filePath ?? location.path ?? location.file) as unknown;
  if (typeof filepathRaw !== "string" || !filepathRaw.trim()) {
    return null;
  }
  const filepath = normalizePath(filepathRaw);
  const startLine = normalizeLineNumber(
    location.startLine ?? location.start_line ?? location.line ?? location.start,
    1
  );
  const endLine = normalizeLineNumber(
    location.endLine ?? location.end_line ?? location.lineEnd ?? location.end,
    startLine
  );
  const details = toRecord(finding.details);
  const toolValue =
    typeof details.tool === "string"
      ? details.tool
      : typeof finding.source === "string"
        ? finding.source
        : "";
  const tool = normalizeStaticTool(toolValue);
  if (!tool) {
    return null;
  }
  const ruleIdRaw =
    details.ruleId ?? details.rule_id ?? details.ruleID ?? finding.type ?? "";
  const ruleId =
    typeof ruleIdRaw === "string" && ruleIdRaw.trim() ? ruleIdRaw.trim() : "unknown_rule";
  const snippet = typeof details.snippet === "string" ? details.snippet : undefined;
  const severity = finding.severity ?? "low";
  return {
    tool,
    ruleId,
    message: finding.summary,
    severity: severity as StaticFinding["severity"],
    filepath,
    startLine,
    endLine: endLine < startLine ? startLine : endLine,
    snippet,
    details: Object.keys(details).length ? details : undefined
  };
}

function toStaticFindingsFromExisting(findings: ExistingScanFinding[]): StaticFinding[] {
  return findings
    .map((finding) => toStaticFindingFromExisting(finding))
    .filter((finding): finding is StaticFinding => Boolean(finding));
}

function toCoreStaticFindings(params: {
  findings: StaticFinding[];
  repoFullName?: string | null;
  repositoryId?: string | null;
  repoPath?: string | null;
  commitSha?: string | null;
  chunks: ChunkRow[];
}): CoreFinding[] {
  const normalizedRepoPath = normalizeRepoPath(params.repoPath ?? "");
  return params.findings.map((finding) => {
    const source = `static_${finding.tool}`;
    const filepath = normalizePath(finding.filepath);
    const chunk = findChunkForLine(params.chunks, filepath, finding.startLine);
    const location = buildCoreLocation({
      filepath,
      startLine: finding.startLine,
      endLine: finding.endLine,
      repoPath: normalizedRepoPath || undefined,
      repoFullName: params.repoFullName ?? undefined,
      commitSha: params.commitSha ?? undefined,
      chunkIndex: chunk?.chunk_index ?? null,
      chunkId: chunk?.id ?? null
    });
    const details: Record<string, unknown> = {
      ...toRecord(finding.details),
      ruleId: finding.ruleId,
      tool: source,
      snippet: finding.snippet ?? null
    };
    if (params.repoFullName) details.repoFullName = params.repoFullName;
    if (normalizedRepoPath) details.repoPath = normalizedRepoPath;
    if (params.commitSha) details.commitSha = params.commitSha;
    if (params.repositoryId) details.repositoryId = params.repositoryId;
    return {
      type: "static",
      source,
      severity: finding.severity,
      summary: finding.message,
      location,
      details
    };
  });
}

function toCoreRepositoryFinding(params: {
  finding: RepositoryScanFinding;
  type: CoreFinding["type"];
  source: string;
  repoFullName?: string | null;
  repositoryId?: string | null;
  repoPath?: string | null;
  commitSha?: string | null;
  chunks: ChunkRow[];
}): CoreFinding {
  const details = { ...toRecord(params.finding.details) };
  const locationRecord = toRecord(params.finding.location);
  const rawFilepath = extractLocationFilepath(locationRecord);
  const normalizedRepoPath = normalizeRepoPath(params.repoPath ?? "");
  const normalizedLocation = rawFilepath
    ? normalizeLocation(locationRecord, rawFilepath, normalizedRepoPath || undefined)
    : null;
  const chunkIndex =
    parseChunkIndex((locationRecord as any).chunkIndex ?? (locationRecord as any).chunk_index) ??
    null;
  const filepath = normalizedLocation?.filepath ?? (rawFilepath ? normalizePath(rawFilepath) : "");
  let chunk: ChunkRow | null = null;
  if (filepath && typeof chunkIndex === "number") {
    chunk = findChunkForIndex(params.chunks, filepath, chunkIndex);
  }
  if (!chunk && filepath && typeof normalizedLocation?.startLine === "number") {
    chunk = findChunkForLine(params.chunks, filepath, normalizedLocation.startLine);
  }

  const repositoryId =
    params.repositoryId ??
    params.finding.repositoryId ??
    (typeof details.repositoryId === "string" ? details.repositoryId : undefined);
  const repositoryFullName =
    params.repoFullName ??
    params.finding.repositoryFullName ??
    (typeof details.repositoryFullName === "string" ? details.repositoryFullName : undefined);

  if (params.finding.type) {
    if (typeof details.findingType !== "string") details.findingType = params.finding.type;
    if (typeof details.type !== "string") details.type = params.finding.type;
    if (!details.ruleId) details.ruleId = params.finding.type;
  }

  const evidence = mergeStringArrays(
    toStringArray(params.finding.evidence),
    toStringArray(details.evidence)
  );
  if (evidence.length > 0 && (!details.evidence || typeof details.evidence === "string" || Array.isArray(details.evidence))) {
    details.evidence = evidence;
  }

  if (repositoryId) details.repositoryId = repositoryId;
  if (repositoryFullName) {
    details.repoFullName = repositoryFullName;
    details.repositoryFullName = repositoryFullName;
  }
  if (normalizedRepoPath) details.repoPath = normalizedRepoPath;
  if (params.commitSha) details.commitSha = params.commitSha;

  const location = buildCoreLocation({
    filepath: filepath || undefined,
    startLine: normalizedLocation?.startLine ?? null,
    endLine: normalizedLocation?.endLine ?? null,
    repoPath: normalizedRepoPath || undefined,
    repoFullName: repositoryFullName ?? params.repoFullName ?? undefined,
    commitSha: params.commitSha ?? undefined,
    chunkIndex: chunk?.chunk_index ?? chunkIndex,
    chunkId: chunk?.id ?? null
  });

  const category = typeof details.category === "string" ? details.category : null;

  return {
    type: params.type,
    source: params.source,
    severity: params.finding.severity,
    summary: params.finding.summary,
    category,
    location,
    details
  };
}

function toCoreRepositoryFindings(params: {
  findings: RepositoryScanFinding[];
  type: CoreFinding["type"];
  source: string;
  repoFullName?: string | null;
  repositoryId?: string | null;
  repoPath?: string | null;
  commitSha?: string | null;
  chunks: ChunkRow[];
}): CoreFinding[] {
  return params.findings.map((finding) =>
    toCoreRepositoryFinding({
      finding,
      type: params.type,
      source: params.source,
      repoFullName: params.repoFullName,
      repositoryId: params.repositoryId,
      repoPath: params.repoPath,
      commitSha: params.commitSha,
      chunks: params.chunks
    })
  );
}

function enrichRepositoryFinding(
  finding: RepositoryScanFinding,
  params: { repoFullName?: string | null; repositoryId?: string | null; repoPath?: string | null; commitSha?: string | null }
): RepositoryScanFinding {
  const details = { ...toRecord(finding.details) };
  const repoFullName = params.repoFullName ?? finding.repositoryFullName ?? undefined;
  const repositoryId = params.repositoryId ?? finding.repositoryId ?? undefined;
  if (repoFullName) {
    details.repoFullName = details.repoFullName ?? repoFullName;
    details.repositoryFullName = details.repositoryFullName ?? repoFullName;
  }
  if (repositoryId) {
    details.repositoryId = details.repositoryId ?? repositoryId;
  }
  if (params.repoPath) {
    details.repoPath = details.repoPath ?? params.repoPath;
  }
  if (params.commitSha) {
    details.commitSha = details.commitSha ?? params.commitSha;
  }
  return {
    ...finding,
    repositoryId: repositoryId ?? undefined,
    repositoryFullName: repoFullName ?? undefined,
    details
  };
}

function toRepositoryFinding(
  finding: RepositoryScanFinding,
  fallbackPath: string,
  repoPath?: string | null
): Finding {
  const details = toRecord(finding.details);
  const categoryRaw =
    details.category ?? details.findingCategory ?? details.finding_category ?? null;
  let category = typeof categoryRaw === "string" ? categoryRaw.trim() : null;
  if (!category) {
    const inferred = inferFindingCategory({ summary: finding.summary, details, location: finding.location ?? null });
    category = inferred || null;
  }
  const location = normalizeLocation(finding.location ?? null, fallbackPath, repoPath);
  const evidence = mergeStringArrays(
    toStringArray(finding.evidence),
    toStringArray(details.evidence)
  );
  const remediation =
    typeof details.recommendation === "string" ? details.recommendation : undefined;
  const rationale = typeof details.rationale === "string" ? details.rationale : "";
  const description =
    rationale || (typeof details.description === "string" ? details.description : "");
  const title = finding.summary.trim();
  const id = sha256(`${title}:${location.filepath}:${location.startLine}:${location.endLine}`);

  return {
    id,
    title,
    severity: finding.severity,
    description,
    category,
    location,
    evidence: evidence.length ? evidence.join(" | ") : undefined,
    remediation,
    source: "llm",
    chunkId: null
  };
}

export async function runScan(options: RunScanOptions): Promise<ScanResult> {
  const start = Date.now();
  let debugWriter: DebugLogWriter | null = null;
  let resumeStore: ScanResumeStore | null = null;

  try {
    const config = await loadConfig({
      projectRoot: options.projectRoot,
      configPath: options.configPath,
      overrides: options.overrides,
      powerMode: options.powerMode
    });

    const log = options.logger ?? (() => {});
    const resumeMode = options.resume ?? "off";
    debugWriter = await createDebugLogWriter({
      enabled: Boolean(options.debug || options.debugLogPath),
      requestedPath: options.debugLogPath ?? null,
      stateDir: config.stateDir,
      log
    });
    const debugContext = (stage: string): DedupeDebug | undefined =>
      debugWriter ? { stage, log: debugWriter.log } : undefined;
    const isResumeEligibleError = (err: unknown): boolean => {
      if (err instanceof ProviderRequestFailedError) return true;
      const name = typeof err === "object" && err ? (err as { name?: unknown }).name : null;
      return name === "ProviderRequestFailedError";
    };
    const handleResumeError = async (err: unknown, stage: "rule" | "composite") => {
      if (!resumeStore || resumeMode === "off") return;
      const message = err instanceof Error ? err.message : String(err);
      if (isResumeEligibleError(err)) {
        await resumeStore.markInterrupted(message, stage);
        return;
      }
      await clearScanResumeState(config.stateDir);
    };
    const repoRoot = config.projectRoot;
    const explicitRepoPath = normalizeRepoPath(options.repoPath ?? config.repoPath ?? "");
    let repoPath: string | null = explicitRepoPath || null;
    if (!repoPath && options.inferRepoPath !== false) {
      log("Inferring repoPath...");
      const inferredRepoPath = await inferRepoPathFromDisk(repoRoot);
      if (inferredRepoPath) {
        repoPath = inferredRepoPath;
        log(`Inferred repoPath: ${repoPath}`);
      }
    }
  
    const resolved = resolveScanRoot(repoRoot, repoPath);
    if (resolved.missing) {
      log(`repoPath missing; falling back to repo root (${resolved.missing})`);
    } else if (repoPath) {
      log(`Scanning repoPath: ${repoPath}`);
    }
    const scanRoot = resolved.scanRoot;
    repoPath = resolved.repoPath;
  
    const repoFullName =
      typeof options.repoFullName === "string" && options.repoFullName.trim()
        ? options.repoFullName.trim()
        : path.basename(config.projectRoot) || "local-repo";
    const repositoryId =
      typeof options.repositoryId === "string" && options.repositoryId.trim()
        ? options.repositoryId.trim()
        : null;
    const commitSha =
      typeof options.commitSha === "string" && options.commitSha.trim()
        ? options.commitSha.trim()
        : null;
    if (debugWriter) {
      debugWriter.log({
        event: "debug_start",
        projectRoot: config.projectRoot,
        scanRoot,
        repoPath,
        repoFullName,
        repositoryId,
        commitSha,
        configPath: options.configPath ?? null
      });
    }

    const jellyAvailable = await isJellyAvailable();
    if (!jellyAvailable) {
      throw new Error(
        "Missing required jelly call graph analyzer. Run 'hadrix setup' to install it."
      );
    }
  
    let supabaseFindings: StaticFinding[] = [];
    if (options.supabase?.connectionString || options.supabase?.schemaSnapshotPath || options.supabase?.useCli) {
      log("Fetching Supabase schema...");
      const supabaseResult = await runSupabaseSchemaScan({
        connectionString: options.supabase?.connectionString,
        schemaSnapshotPath: options.supabase?.schemaSnapshotPath,
        useCli: options.supabase?.useCli ?? false,
        projectRoot: config.projectRoot,
        stateDir: config.stateDir,
        logger: log
      });
      supabaseFindings = supabaseResult.findings;
    }

    if (options.progress) {
      if (options.skipStatic) {
        options.progress({ phase: "static_scanners", current: 0, total: 0, message: "skipped" });
      } else {
        options.progress({ phase: "static_scanners", current: 0, total: 1 });
      }
    }
    const rawStaticFindings = options.skipStatic
      ? [...supabaseFindings]
      : [...supabaseFindings, ...(await runStaticScanners(config, scanRoot, log))];
    if (options.progress && !options.skipStatic) {
      options.progress({ phase: "static_scanners", current: 1, total: 1 });
    }
    log(options.skipStatic ? "Static scanners skipped." : "Static scanners complete.");
  
    let jellyResult: JellyAnchorComputation | null = null;
    let jellyIndex: AnchorIndex | null = null;
    log("Computing jelly anchors...");
    jellyResult = await computeJellyAnchors({
      repoRoot,
      scanRoot,
      commitSha
    });
    jellyIndex = jellyResult.index;
    if (jellyIndex) {
      log(
        `Jelly anchors ready (${jellyIndex.anchorCount} nodes across ${jellyIndex.fileCount} files).`
      );
    } else {
      const reason = jellyResult.reason ? ` (${jellyResult.reason})` : "";
      log(`Jelly anchors unavailable${reason}.`);
    }
    {
      const jellyReport = buildJellyAnchorsReport({
        enabled: true,
        skipped: false,
        repoRoot,
        scanRoot,
        repoPath: repoPath ?? null,
        commitSha,
        result: jellyResult,
        index: jellyIndex
      });
      if (debugWriter) {
        debugWriter.log({ event: "jelly_anchors", ...jellyReport });
      }
      try {
        await writeJellyAnchorsReport(config.stateDir, jellyReport, log);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`Failed to persist jelly anchors report: ${message}`);
      }
    }

    if (!jellyIndex && jellyResult.reason !== "repo_not_js_ts") {
      const reason = jellyResult.reason ?? "unknown";
      const details = jellyResult.error ? `: ${jellyResult.error}` : "";
      throw new Error(`Jelly call graph required but failed (${reason})${details}.`);
    }
  
    let staticExistingFindings = toExistingFindings(
      rawStaticFindings,
      repoPath,
      repoFullName,
      repositoryId
    );
    if (jellyIndex) {
      const applied = attachJellyAnchors(staticExistingFindings, jellyIndex);
      if (applied.anchored > 0) {
        log(`Jelly anchors applied to static findings (${applied.anchored}/${applied.total}).`);
      }
    }
    staticExistingFindings = staticExistingFindings.map((finding) =>
      applyFindingIdentityKey(finding, repoPath)
    );
  
    const { kept: filteredStaticExisting, dropped: staticFilteredDropped } = filterFindings(
      staticExistingFindings
    );
    if (staticFilteredDropped > 0) {
      log(`Filtered ${staticFilteredDropped} static findings.`);
    }
  
    const reportStaticFindings = toStaticFindingsFromExisting(filteredStaticExisting);
    const { findings: dedupedStaticExisting, dropped: staticDedupeDropped } = dedupeFindings(
      filteredStaticExisting,
      undefined,
      debugContext("static_dedupe")
    );
    if (staticDedupeDropped > 0) {
      log(`Deduped ${staticDedupeDropped} static findings.`);
    }
  
    const staticFindings = toStaticFindingsFromExisting(dedupedStaticExisting);
  
    const normalizedExistingFindings = normalizeExistingFindings(options.existingFindings, {
      repoFullName,
      repositoryId,
      repoPath
    }).map((finding) => applyFindingIdentityKey(finding, repoPath));
    const existingFindings = [
      ...dedupedStaticExisting,
      ...normalizedExistingFindings
    ];
  
    const files = await discoverFiles({
      root: scanRoot,
      includeExtensions: config.chunking.includeExtensions,
      exclude: config.chunking.exclude,
      maxFileSizeBytes: config.chunking.maxFileSizeBytes
    });

    let reachabilityIndex: ReachabilityIndex | null = null;
    if (jellyIndex?.callGraph) {
      const entryPoints = await discoverEntryPoints({ repoRoot, files });
      if (entryPoints.length > 0) {
        reachabilityIndex = buildJellyReachabilityIndex({
          anchorIndex: jellyIndex,
          entryPoints,
          repoPath: repoPath ?? null
        });
        if (reachabilityIndex) {
          log(`Jelly reachability mapped to ${entryPoints.length} entry points.`);
        } else {
          log("Jelly reachability unavailable (entry points did not match call graph).");
        }
      }
    }
  
    const db = new HadrixDb({
      stateDir: config.stateDir,
      logger: log
    });
    const desiredChunkFormat = "security_semantic";
    log("Security chunking enabled.");
    const repoSnapshotEntries: string[] = [];
  
    // Embeddings removed.
  
    try {
      for (const file of files) {
        const relPath = toRelative(config.projectRoot, file);
        const normalizedRelPath = normalizePath(relPath);
        let fileHash: string;
        let stats: ReturnType<typeof statSync>;
        try {
          fileHash = hashFile(file);
          stats = statSync(file);
        } catch {
          continue;
        }
        repoSnapshotEntries.push(`${normalizedRelPath}:${fileHash}`);
        const existing = db.getFileByPath(relPath);
        const existingFormat = existing ? db.getChunkFormatForFile(existing.id) : null;
  
        if (existing && existing.hash === fileHash && existingFormat === desiredChunkFormat) {
          continue;
        }
  
        const fileRow = db.upsertFile({
          path: relPath,
          hash: fileHash,
          mtimeMs: stats.mtimeMs,
          size: stats.size
        });
  
        db.deleteChunksForFile(fileRow.id);

        const jellyAnchors = jellyIndex
          ? jellyIndex.getAnchorsForFile({ filepath: relPath, repoPath })
          : [];
        const anchorNodes = jellyAnchors.length
          ? jellyAnchors.map((anchor) => ({
              filePath: normalizedRelPath,
              startLine: anchor.startLine,
              endLine: anchor.endLine,
              startColumn: anchor.startColumn,
              endColumn: anchor.endColumn,
              anchorId: anchor.anchorId
            }))
          : undefined;

        const chunks = securityChunkFile({
          filePath: file,
          idPath: relPath,
          repoPath,
          anchors: anchorNodes,
          reachabilityIndex,
          callGraph: jellyIndex?.callGraph ?? null
        });
        if (chunks.length === 0) {
          log(`Security chunking produced no chunks for ${relPath}; skipping file.`);
          continue;
        }
  
        const inserted = db.insertChunks(
          fileRow.id,
          relPath,
          chunks.map((chunk) => ({
            chunkUid: chunk.id,
            chunkIndex: chunk.chunkIndex,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            content: chunk.content,
            contentHash: chunk.contentHash,
            chunkFormat: chunk.chunkFormat ?? "security_semantic",
            securityHeader: chunk.securityHeader ?? null,
            primarySymbol: chunk.primarySymbol ?? null,
            entryPoint: chunk.entryPoint ?? null,
            executionRole: chunk.executionRole ?? null,
            sinks: chunk.sinks ?? null,
            overlapGroupId: chunk.overlapGroupId ?? null,
            dedupeKey: chunk.dedupeKey ?? null
          }))
        );
  
        // Embeddings removed.
        void inserted;
      }
  
      // Embeddings removed.

      const repoSnapshot = resumeMode !== "off" ? buildRepoSnapshot(repoSnapshotEntries) : null;
      const allChunks = db.getAllChunks();
      const scopedChunks = repoPath
        ? allChunks.filter(
            (chunk) => chunk.filepath === repoPath || chunk.filepath.startsWith(`${repoPath}/`)
          )
        : allChunks;
      const scannedChunks = scopedChunks.length;
      const llmSource = `llm_${config.llm.provider}_repository_scan`;
      const llmCompositeSource = `llm_${config.llm.provider}_repository_composite_scan`;
      let llmFindings: RepositoryScanFinding[] = [];
      let reportLlmFindings: RepositoryScanFinding[] = [];
      let compositeFindings: RepositoryScanFinding[] = [];
      let fileSamples: RepositoryFileSample[] = [];
      let repositoryDescriptor: { fullName: string; repoPaths: string[] } | null = null;

      if (resumeMode !== "off" && scannedChunks === 0) {
        await clearScanResumeState(config.stateDir);
      }
  
      if (scopedChunks.length > 0) {
        log("Chunk sampling...");

        const localChunks = scopedChunks.map((chunk) =>
          toLocalChunk({
            filepath: chunk.filepath,
            chunk_index: chunk.chunk_index,
            start_line: chunk.start_line,
            end_line: chunk.end_line,
            content: chunk.content,
            chunk_format: chunk.chunk_format,
            overlap_group_id: chunk.overlap_group_id ?? null
          })
        );

        // Deterministic inclusion: always bias sampling toward auth, routing, and obvious sinks.
        // This improves recall without relying purely on embedding queries.
        const alwaysIncludePathPatterns: RegExp[] = [
          /(^|\/)middleware\.(ts|tsx|js|jsx|mjs|cjs)$/i,
          /(^|\/)(auth|jwt|session)(\.|\/)/i,
          /(^|\/)pages\/api\//i,
          /(^|\/)app\/.*\/route\.(ts|tsx|js|jsx|mjs|cjs)$/i,
          /(^|\/)api\//i,
          /(^|\/)functions\//i,
          /(^|\/)supabase\/functions\//i,
          /(^|\/)_shared\//i
        ];
        const alwaysIncludeContentPatterns: RegExp[] = [
          /\bexecSync\s*\(/i,
          /\bexec\s*\(/i,
          /\bspawnSync\s*\(/i,
          /\bspawn\s*\(/i,
          /\bDeno\.Command\b/i,
          /\bDeno\.run\b/i,
          /\bnew Function\b/i,
          /\beval\s*\(/i,
          /\bdangerouslySetInnerHTML\b/i,
          /\bsql\b/i,
          /\.from\s*\(/i,
          /\bwebhook\b/i
        ];

        const mustInclude = (() => {
          const byFile = new Map<string, ReturnType<typeof toLocalChunk>[]>();
          for (const chunk of localChunks) {
            if (!chunk.filepath) continue;
            if (!byFile.has(chunk.filepath)) byFile.set(chunk.filepath, []);
            byFile.get(chunk.filepath)!.push(chunk);
          }
          for (const list of byFile.values()) {
            list.sort((a, b) => a.chunkIndex - b.chunkIndex);
          }

          const selected: ReturnType<typeof toLocalChunk>[] = [];
          const seen = new Set<string>();

          const pushChunk = (chunk: ReturnType<typeof toLocalChunk> | undefined) => {
            if (!chunk) return;
            const key = `${chunk.filepath}#${chunk.chunkIndex}`;
            if (seen.has(key)) return;
            seen.add(key);
            selected.push(chunk);
          };

          for (const [filepath, list] of byFile.entries()) {
            const pathHit = alwaysIncludePathPatterns.some((re) => re.test(filepath));
            if (pathHit) {
              // Include up to 2 chunks for key files.
              pushChunk(list[0]);
              pushChunk(list[1]);
              continue;
            }

            // Include first chunk for files containing obvious sinks.
            const hasSink = list.some((chunk) =>
              alwaysIncludeContentPatterns.some((re) => re.test(chunk.content || ""))
            );
            if (hasSink) {
              pushChunk(list[0]);
            }
          }

          // Cap to avoid blowing up sampling.
          return selected.slice(0, 80);
        })();

        fileSamples = buildRepositoryFileSamples(localChunks, {
          maxFiles: config.sampling.maxFiles,
          maxChunksPerFile: config.sampling.maxChunksPerFile,
          preferredChunks: mustInclude
        });

        if (fileSamples.length === 0 && resumeMode !== "off") {
          await clearScanResumeState(config.stateDir);
        }

        if (fileSamples.length > 0) {
          repositoryDescriptor = {
            fullName: repoFullName,
            repoPaths: repoPath ? [repoPath] : []
          };

          if (resumeMode !== "off") {
            resumeStore = await createScanResumeStore({
              stateDir: config.stateDir,
              scanRoot,
              repoPath: repoPath ?? null,
              repoSnapshot,
              mode: resumeMode,
              logger: log
            });
            await resumeStore.setStage("rule");
          }

          log("LLM scan (rule pass)...");
          try {
            llmFindings = await scanRepository({
              config,
              repository: repositoryDescriptor,
              files: fileSamples,
              existingFindings,
              logger: log,
              debug: debugContext("llm_rule_pass"),
              resume: resumeStore ?? undefined,
              progress: options.progress
            });
          } catch (err) {
            await handleResumeError(err, "rule");
            throw err;
          }
        }
      }
  
      if (llmFindings.length > 0) {
        llmFindings = llmFindings.map((finding) => applyFindingIdentityKey(finding, repoPath));
        llmFindings = llmFindings.map((finding) =>
          enrichRepositoryFinding(finding, {
            repoFullName,
            repositoryId,
            repoPath,
            commitSha
          })
        );
      }
  
      if (jellyIndex && llmFindings.length > 0) {
        const appliedLlm = attachJellyAnchors(llmFindings, jellyIndex);
        if (appliedLlm.anchored > 0) {
          log(`Jelly anchors applied to LLM findings (${appliedLlm.anchored}/${appliedLlm.total}).`);
        }
      }
  
      if (llmFindings.length > 0) {
        const normalizedLlmFindings = llmFindings.map(normalizeRepositoryFinding);
        const { kept: filteredLlmFindings, dropped: filteredLlmDropped } = filterFindings(
          normalizedLlmFindings
        );
        if (filteredLlmDropped > 0) {
          log(`Filtered ${filteredLlmDropped} LLM findings.`);
        }
        reportLlmFindings = filteredLlmFindings;
  
        const { findings: dedupedLlmFindings, dropped: dedupeLlmDropped } = dedupeFindings(
          filteredLlmFindings,
          llmSource,
          debugContext("llm_dedupe")
        );
        if (dedupeLlmDropped > 0) {
          log(`Deduped ${dedupeLlmDropped} LLM findings.`);
        }
  
        const { findings: dedupedAgainstStatic, dropped: dedupeAgainstStaticDropped } =
          dedupeRepositoryFindingsAgainstExisting(
            dedupedLlmFindings,
            dedupedStaticExisting,
            debugContext("llm_vs_static")
          );
        if (dedupeAgainstStaticDropped > 0) {
          log(`Deduped ${dedupeAgainstStaticDropped} LLM findings against static findings.`);
        }
        const { findings: dedupedSummaryFindings, dropped: summaryDropped } =
          dropRepositorySummaryDuplicates(dedupedAgainstStatic, debugContext("llm_summary"));
        if (summaryDropped > 0) {
          log(`Dropped ${summaryDropped} repository summary findings duplicated by file findings.`);
        }
        llmFindings = dedupedSummaryFindings.map((finding) => applyFindingIdentityKey(finding, repoPath));
      }
  
      if (
        fileSamples.length > 0 &&
        repositoryDescriptor &&
        (llmFindings.length || existingFindings.length)
      ) {
        if (!isCompositeScanEnabled()) {
          log("LLM composite pass disabled (HADRIX_DISABLE_COMPOSITE_SCAN=1).");
          options.progress?.({ phase: "llm_composite", current: 0, total: 0, message: "disabled" });
        } else {
          const resumedComposite = resumeStore?.getCompositeResults();
          if (resumedComposite !== null && resumedComposite !== undefined) {
            compositeFindings = resumedComposite;
            options.progress?.({ phase: "llm_composite", current: 1, total: 1 });
          } else {
            if (resumeStore) {
              await resumeStore.setStage("composite");
            }
            log("LLM scan (composite pass)...");
            try {
              options.progress?.({ phase: "llm_composite", current: 0, total: 1 });
              compositeFindings = await scanRepositoryComposites({
                config,
                repository: repositoryDescriptor,
                files: fileSamples,
                existingFindings,
                priorFindings: llmFindings,
                debug: debugContext("llm_composite_pass")
              });
              await resumeStore?.recordCompositeResult(compositeFindings);
              options.progress?.({ phase: "llm_composite", current: 1, total: 1 });
            } catch (err) {
              await handleResumeError(err, "composite");
              throw err;
            }
          }
        }
      }
  
      if (compositeFindings.length > 0) {
        compositeFindings = compositeFindings.map((finding) => applyFindingIdentityKey(finding, repoPath));
        compositeFindings = compositeFindings.map((finding) =>
          enrichRepositoryFinding(finding, {
            repoFullName,
            repositoryId,
            repoPath,
            commitSha
          })
        );
        compositeFindings = compositeFindings.map(normalizeRepositoryFinding);
      }
  
      if (jellyIndex && compositeFindings.length > 0) {
        const appliedComposite = attachJellyAnchors(compositeFindings, jellyIndex);
        if (appliedComposite.anchored > 0) {
          log(
            `Jelly anchors applied to composite findings (${appliedComposite.anchored}/${appliedComposite.total}).`
          );
        }
      }
      if (compositeFindings.length > 0) {
        compositeFindings = compositeFindings.map((finding) => applyFindingIdentityKey(finding, repoPath));
      }
  
      let combinedFindings =
        llmFindings.length || compositeFindings.length
          ? reduceRepositoryFindings(
              [...llmFindings, ...compositeFindings],
              debugContext("llm_composite_reduce")
            )
          : [];
      if (combinedFindings.length > 0) {
        const { findings: dedupedSummaryFindings, dropped: summaryDropped } =
          dropRepositorySummaryDuplicates(combinedFindings, debugContext("combined_summary"));
        if (summaryDropped > 0) {
          log(`Dropped ${summaryDropped} repository summary findings duplicated by file findings.`);
        }
        combinedFindings = dedupedSummaryFindings;
        const { findings: dedupedCombined, dropped: dedupeCombinedDropped } = dedupeFindings(
          combinedFindings,
          llmSource,
          debugContext("combined_dedupe")
        );
        if (dedupeCombinedDropped > 0) {
          log(`Deduped ${dedupeCombinedDropped} combined LLM findings.`);
        }
        combinedFindings = dedupedCombined;
      }
      const fallbackPath = "(repository)";
      const llmOutput = combinedFindings.map((finding) =>
        toRepositoryFinding(finding, fallbackPath, repoPath)
      );
      const coreStaticFindings = toCoreStaticFindings({
        findings: staticFindings,
        repoFullName,
        repositoryId,
        repoPath,
        commitSha,
        chunks: scopedChunks
      });
      if (jellyIndex) {
        attachJellyAnchors(coreStaticFindings, jellyIndex);
      }
      const coreFindings = [
        ...coreStaticFindings,
        ...toCoreRepositoryFindings({
          findings: llmFindings,
          type: "repository",
          source: llmSource,
          repoFullName,
          repositoryId,
          repoPath,
          commitSha,
          chunks: scopedChunks
        })
      ];
      const coreCompositeFindings = toCoreRepositoryFindings({
        findings: compositeFindings,
        type: "repository_composite",
        source: llmCompositeSource,
        repoFullName,
        repositoryId,
        repoPath,
        commitSha,
        chunks: scopedChunks
      });
  
      const reportRawFindings = [
        ...toCoreStaticFindings({
          findings: reportStaticFindings,
          repoFullName,
          repositoryId,
          repoPath,
          commitSha,
          chunks: scopedChunks
        }),
        ...toCoreRepositoryFindings({
          findings: reportLlmFindings,
          type: "repository",
          source: llmSource,
          repoFullName,
          repositoryId,
          repoPath,
          commitSha,
          chunks: scopedChunks
        }),
        ...toCoreRepositoryFindings({
          findings: compositeFindings,
          type: "repository_composite",
          source: llmCompositeSource,
          repoFullName,
          repositoryId,
          repoPath,
          commitSha,
          chunks: scopedChunks
        })
      ];
      const finalFindingCount = staticFindings.length + combinedFindings.length;
      const dedupeReport = buildDedupeReport(reportRawFindings, finalFindingCount);

      // Only emit and persist dedupe report diagnostics in debug mode.
      if (debugWriter) {
        log(
          `Dedupe report: total=${dedupeReport.totalFindings}, uniqueLocations=${dedupeReport.uniqueByLocation}, exactDuplicates=${dedupeReport.exactDuplicates}, merged=${dedupeReport.mergedCount}, missingAnchors=${dedupeReport.missingAnchorPercent.toFixed(1)}%, missingOverlap=${dedupeReport.missingOverlapPercent.toFixed(1)}%.`
        );
        if (Object.keys(dedupeReport.duplicatesBySource).length > 0) {
          log(`Duplicates by source: ${formatCountMap(dedupeReport.duplicatesBySource)}.`);
        }
        if (Object.keys(dedupeReport.duplicatesByRule).length > 0) {
          log(`Duplicates by rule: ${formatCountMap(dedupeReport.duplicatesByRule)}.`);
        }
        if (Object.keys(dedupeReport.duplicatesByCategory).length > 0) {
          log(`Duplicates by category: ${formatCountMap(dedupeReport.duplicatesByCategory)}.`);
        }
        try {
          await writeDedupeReport(config.stateDir, dedupeReport, log);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          log(`Failed to persist dedupe report: ${message}`);
        }
      }
  
      const scanResult: ScanResult = {
        findings: [...toStaticFindings(staticFindings, repoPath), ...llmOutput],
        scannedFiles: files.length,
        scannedChunks,
        durationMs: Date.now() - start,
        staticFindings,
        repositoryFindings: llmFindings,
        compositeFindings,
        existingFindings,
        coreFindings,
        coreCompositeFindings
      };
      if (resumeStore) {
        await resumeStore.markCompleted();
      }
      options.progress?.({ phase: "postprocess", current: 1, total: 1 });
      return scanResult;
    } finally {
      db.close();
    }
  } catch (err) {
    if (debugWriter) {
      const message = err instanceof Error ? err.message : String(err);
      debugWriter.log({
        event: "scan_error",
        name: err instanceof Error ? err.name : "Error",
        message,
        stack: err instanceof Error ? err.stack : undefined
      });
    }
    throw err;
  } finally {
    if (debugWriter) {
      await debugWriter.close();
    }
  }
}

function toStaticFindings(staticFindings: StaticFinding[], repoPath?: string | null): Finding[] {
  const normalizedRepoPath = normalizeRepoPath(repoPath ?? "");
  return staticFindings.map((finding) => {
    const filepath = normalizePath(finding.filepath);
    const location: { filepath: string; startLine: number; endLine: number; repoPath?: string } = {
      filepath,
      startLine: finding.startLine,
      endLine: finding.endLine
    };
    if (normalizedRepoPath && (filepath === normalizedRepoPath || filepath.startsWith(`${normalizedRepoPath}/`))) {
      location.repoPath = normalizedRepoPath;
    }
    let category: string | null = null;
    if (finding.tool === "osv-scanner") {
      category = "dependency_risks";
    } else if (finding.tool === "gitleaks") {
      category = "secrets";
    } else if (finding.tool === "supabase") {
      category = "supabase";
    } else {
      category = inferFindingCategory({
        summary: finding.message,
        details: {
          tool: `static_${finding.tool}`,
          ruleId: finding.ruleId,
          snippet: finding.snippet ?? null
        },
        location
      }) || null;
    }
    return {
      id: sha256(`${finding.tool}:${finding.ruleId}:${finding.filepath}:${finding.startLine}:${finding.endLine}`),
      title: `${finding.tool}: ${finding.ruleId}`,
      severity: finding.severity,
      description: finding.message,
      category,
      location,
      evidence: finding.snippet,
      remediation: undefined,
      source: "static",
      chunkId: null
    };
  });
}
