import { statSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { HadrixConfig } from "../config/loadConfig.js";
import { loadConfig } from "../config/loadConfig.js";
import { discoverFiles } from "../fs/discover.js";
import { chunkFile, hashFile, toRelative } from "../chunking/chunker.js";
import { HadrixDb } from "../storage/db.js";
import { embedTexts } from "../providers/embedding.js";
import { buildRepositoryFileSamples, toLocalChunk } from "./chunkSampling.js";
import { reduceRepositoryFindings, scanRepository, scanRepositoryComposites } from "./repositoryScanner.js";
import { runStaticScanners } from "./staticScanners.js";
import { inferRepoPathFromDisk, normalizeRepoPath } from "./repoPath.js";
import type {
  CoreFinding,
  ExistingScanFinding,
  Finding,
  RepositoryScanFinding,
  ScanResult,
  StaticFinding
} from "../types.js";

export interface RunScanOptions {
  projectRoot: string;
  configPath?: string | null;
  overrides?: Partial<HadrixConfig>;
  repoPath?: string | null;
  inferRepoPath?: boolean;
  skipStatic?: boolean;
  existingFindings?: ExistingScanFinding[];
  repoFullName?: string | null;
  repositoryId?: string | null;
  commitSha?: string | null;
  logger?: (message: string) => void;
}

type ChunkRow = {
  id: number;
  filepath: string;
  chunk_index: number;
  start_line: number;
  end_line: number;
};

function embeddingToBuffer(vector: number[], expectedDims: number): Buffer {
  if (vector.length !== expectedDims) {
    throw new Error(`Embedding dimension mismatch: expected ${expectedDims}, got ${vector.length}.`);
  }
  const floats = new Float32Array(vector.length);
  for (let i = 0; i < vector.length; i += 1) {
    floats[i] = vector[i] ?? 0;
  }
  return Buffer.from(floats.buffer);
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
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
    return {
      repositoryId: repositoryId ?? undefined,
      repositoryFullName: repoFullName ?? undefined,
      type: null,
      source,
      severity: finding.severity,
      summary: finding.message,
      location,
      details: {
        tool: source,
        ruleId: finding.ruleId
      }
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
    location,
    evidence: evidence.length ? evidence.join(" | ") : undefined,
    remediation,
    source: "llm",
    chunkId: null
  };
}

export async function runScan(options: RunScanOptions): Promise<ScanResult> {
  const start = Date.now();
  const config = await loadConfig({
    projectRoot: options.projectRoot,
    configPath: options.configPath,
    overrides: options.overrides
  });

  const log = options.logger ?? (() => {});
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

  const staticFindings = options.skipStatic
    ? []
    : await runStaticScanners(config, scanRoot, log);
  log(options.skipStatic ? "Static scanners skipped." : "Static scanners complete.");

  const existingFindings = [
    ...toExistingFindings(staticFindings, repoPath, repoFullName, repositoryId),
    ...normalizeExistingFindings(options.existingFindings, {
      repoFullName,
      repositoryId,
      repoPath
    })
  ];

  const files = await discoverFiles({
    root: scanRoot,
    includeExtensions: config.chunking.includeExtensions,
    exclude: config.chunking.exclude,
    maxFileSizeBytes: config.chunking.maxFileSizeBytes
  });

  const db = new HadrixDb({
    stateDir: config.stateDir,
    extensionPath: config.vector.extensionPath,
    vectorDimensions: config.embeddings.dimensions,
    vectorMaxElements: config.vector.maxElements,
    logger: log
  });

  const newEmbeddings: Array<{ chunkId: number; content: string }> = [];

  try {
    for (const file of files) {
      const relPath = toRelative(config.projectRoot, file);
      let fileHash: string;
      let stats: ReturnType<typeof statSync>;
      try {
        fileHash = hashFile(file);
        stats = statSync(file);
      } catch {
        continue;
      }
      const existing = db.getFileByPath(relPath);

      if (existing && existing.hash === fileHash) {
        continue;
      }

      const fileRow = db.upsertFile({
        path: relPath,
        hash: fileHash,
        mtimeMs: stats.mtimeMs,
        size: stats.size
      });

      db.deleteChunksForFile(fileRow.id);

      const chunks = chunkFile(file, {
        maxChars: config.chunking.maxChars,
        overlapChars: config.chunking.overlapChars,
        idPath: relPath
      });

      const inserted = db.insertChunks(
        fileRow.id,
        relPath,
        chunks.map((chunk) => ({
          chunkUid: chunk.id,
          chunkIndex: chunk.chunkIndex,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          content: chunk.content,
          contentHash: chunk.contentHash
        }))
      );

      const idByUid = new Map(inserted.map((row) => [row.chunkUid, row.id]));
      for (const chunk of chunks) {
        const chunkId = idByUid.get(chunk.id);
        if (!chunkId) continue;
        newEmbeddings.push({ chunkId, content: chunk.content });
      }
    }

    let embeddingQueue = newEmbeddings;
    if (db.didResetEmbeddings()) {
      log("Embedding dimensions changed; rebuilding embeddings for all chunks.");
      const allChunks = db.getAllChunks();
      embeddingQueue = allChunks.map((chunk) => ({ chunkId: chunk.id, content: chunk.content }));
    }

    if (embeddingQueue.length) {
      log(`Embedding ${embeddingQueue.length} chunks...`);
      const batchSize = config.embeddings.batchSize;
      for (let i = 0; i < embeddingQueue.length; i += batchSize) {
        const batch = embeddingQueue.slice(i, i + batchSize);
        const vectors = await embedTexts(
          config,
          batch.map((item) => item.content)
        );
        const rows = vectors.map((vector, index) => ({
          chunkId: batch[index]?.chunkId ?? 0,
          embedding: embeddingToBuffer(vector, config.embeddings.dimensions)
        }));
        db.insertEmbeddings(rows);
      }
    }

    const allChunks = db.getAllChunks();
    const scopedChunks = repoPath
      ? allChunks.filter(
          (chunk) => chunk.filepath === repoPath || chunk.filepath.startsWith(`${repoPath}/`)
        )
      : allChunks;
    const scannedChunks = scopedChunks.length;
    let llmFindings: RepositoryScanFinding[] = [];
    let compositeFindings: RepositoryScanFinding[] = [];

    if (scopedChunks.length > 0) {
      let preferredChunks: ReturnType<typeof toLocalChunk>[] = [];
      if (config.sampling.queries.length) {
        log("Retrieving top-k chunks...");
        const queryEmbeddings = await embedTexts(config, config.sampling.queries);
        const candidates = new Map<number, number>();

        for (const vector of queryEmbeddings) {
          const results = db.querySimilar(
            embeddingToBuffer(vector, config.embeddings.dimensions),
            config.sampling.topKPerQuery
          );
          for (const result of results) {
            const existing = candidates.get(result.chunkId);
            if (existing === undefined || result.distance < existing) {
              candidates.set(result.chunkId, result.distance);
            }
          }
        }

        const orderedIds = [...candidates.entries()]
          .sort((a, b) => a[1] - b[1])
          .map(([id]) => id);

        const limitedIds = orderedIds.slice(0, Math.max(1, config.sampling.maxChunks));
        const rows = db.getChunksByIds(limitedIds);
        const rowById = new Map(rows.map((row) => [row.id, row]));
        preferredChunks = limitedIds
          .map((id) => rowById.get(id))
          .filter(Boolean)
          .filter((row) =>
            repoPath ? row!.filepath === repoPath || row!.filepath.startsWith(`${repoPath}/`) : true
          )
          .map((row) => toLocalChunk(row!));
      }

      log("Heuristic analysis and chunk sampling...");
      const fileSamples = buildRepositoryFileSamples(
        scopedChunks.map((chunk) =>
          toLocalChunk({
            filepath: chunk.filepath,
            chunk_index: chunk.chunk_index,
            start_line: chunk.start_line,
            end_line: chunk.end_line,
            content: chunk.content
          })
        ),
        {
          maxFiles: config.sampling.maxChunks,
          maxChunksPerFile: config.sampling.maxChunksPerFile,
          preferredChunks
        }
      );

      if (fileSamples.length > 0) {
        const repository = {
          fullName: repoFullName,
          repoPaths: repoPath ? [repoPath] : []
        };

        log("LLM scan (map pass)...");
        llmFindings = await scanRepository({
          config,
          repository,
          files: fileSamples,
          existingFindings
        });

        if (llmFindings.length || existingFindings.length) {
          log("LLM scan (composite pass)...");
          compositeFindings = await scanRepositoryComposites({
            config,
            repository,
            files: fileSamples,
            existingFindings,
            priorFindings: llmFindings
          });
        }
      }
    }

    if (llmFindings.length > 0 || compositeFindings.length > 0) {
      llmFindings = llmFindings.map((finding) =>
        enrichRepositoryFinding(finding, {
          repoFullName,
          repositoryId,
          repoPath,
          commitSha
        })
      );
      compositeFindings = compositeFindings.map((finding) =>
        enrichRepositoryFinding(finding, {
          repoFullName,
          repositoryId,
          repoPath,
          commitSha
        })
      );
    }

    const combinedFindings =
      llmFindings.length || compositeFindings.length
        ? reduceRepositoryFindings([...llmFindings, ...compositeFindings])
        : [];
    const fallbackPath = "(repository)";
    const llmOutput = combinedFindings.map((finding) =>
      toRepositoryFinding(finding, fallbackPath, repoPath)
    );

    const llmSource = `llm_${config.llm.provider}_repository_scan`;
    const llmCompositeSource = `llm_${config.llm.provider}_repository_composite_scan`;
    const coreFindings = [
      ...toCoreStaticFindings({
        findings: staticFindings,
        repoFullName,
        repositoryId,
        repoPath,
        commitSha,
        chunks: scopedChunks
      }),
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

    return {
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
  } finally {
    db.close();
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
    return {
      id: sha256(`${finding.tool}:${finding.ruleId}:${finding.filepath}:${finding.startLine}:${finding.endLine}`),
      title: `${finding.tool}: ${finding.ruleId}`,
      severity: finding.severity,
      description: finding.message,
      location,
      evidence: finding.snippet,
      remediation: undefined,
      source: "static",
      chunkId: null
    };
  });
}
