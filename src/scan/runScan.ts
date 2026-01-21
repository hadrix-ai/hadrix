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
import type { ExistingScanFinding, Finding, RepositoryScanFinding, ScanResult, StaticFinding } from "../types.js";

export interface RunScanOptions {
  projectRoot: string;
  configPath?: string | null;
  overrides?: Partial<HadrixConfig>;
  repoPath?: string | null;
  inferRepoPath?: boolean;
  logger?: (message: string) => void;
}

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

function toExistingFindings(staticFindings: StaticFinding[], repoPath?: string | null): ExistingScanFinding[] {
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
      type: null,
      source: finding.tool,
      severity: finding.severity,
      summary: finding.message,
      location,
      details: {
        tool: finding.tool,
        ruleId: finding.ruleId
      }
    };
  });
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

  const staticFindings = await runStaticScanners(config, scanRoot, log);
  log("Static scanners complete.");

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

    if (!scopedChunks.length) {
      return {
        findings: toStaticFindings(staticFindings, repoPath),
        scannedFiles: files.length,
        scannedChunks,
        durationMs: Date.now() - start
      };
    }

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

    if (!fileSamples.length) {
      return {
        findings: toStaticFindings(staticFindings, repoPath),
        scannedFiles: files.length,
        scannedChunks,
        durationMs: Date.now() - start
      };
    }

    const repository = {
      fullName: path.basename(config.projectRoot) || "local-repo",
      repoPaths: repoPath ? [repoPath] : []
    };

    const existingFindings = toExistingFindings(staticFindings, repoPath);

    log("LLM scan (map pass)...");
    const llmFindings = await scanRepository({
      config,
      repository,
      files: fileSamples,
      existingFindings
    });

    let compositeFindings: RepositoryScanFinding[] = [];
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

    const combinedFindings = reduceRepositoryFindings([...llmFindings, ...compositeFindings]);
    const fallbackPath = "(repository)";
    const llmOutput = combinedFindings.map((finding) =>
      toRepositoryFinding(finding, fallbackPath, repoPath)
    );

    return {
      findings: [...toStaticFindings(staticFindings, repoPath), ...llmOutput],
      scannedFiles: files.length,
      scannedChunks,
      durationMs: Date.now() - start
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
