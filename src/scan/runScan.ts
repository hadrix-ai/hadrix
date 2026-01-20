import { statSync } from "node:fs";
import type { HadrixConfig } from "../config/loadConfig.js";
import { loadConfig } from "../config/loadConfig.js";
import { discoverFiles } from "../fs/discover.js";
import { chunkFile, hashFile, toRelative } from "../chunking/chunker.js";
import { HadrixDb } from "../storage/db.js";
import { embedTexts } from "../providers/embedding.js";
import { runChatCompletion } from "../providers/llm.js";
import { buildScanMessages, parseFindings, type PromptChunk } from "./prompt.js";
import { runStaticScanners, summarizeStaticFindings } from "./staticScanners.js";
import type { Finding, ScanResult, StaticFinding } from "../types.js";

export interface RunScanOptions {
  projectRoot: string;
  configPath?: string | null;
  overrides?: Partial<HadrixConfig>;
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

function pickChunks(
  chunks: Array<{ id: number; chunk_uid: string; filepath: string; start_line: number; end_line: number; content: string; chunk_index: number }>,
  orderedIds: number[],
  maxChunks: number,
  maxChunksPerFile: number
): PromptChunk[] {
  const chunkById = new Map<number, PromptChunk>();
  for (const chunk of chunks) {
    chunkById.set(chunk.id, {
      id: chunk.chunk_uid,
      filepath: chunk.filepath,
      startLine: chunk.start_line,
      endLine: chunk.end_line,
      content: chunk.content
    });
  }

  const perFileCount = new Map<string, number>();
  const selected: PromptChunk[] = [];

  for (const id of orderedIds) {
    const chunk = chunkById.get(id);
    if (!chunk) continue;
    const count = perFileCount.get(chunk.filepath) ?? 0;
    if (count >= maxChunksPerFile) continue;
    selected.push(chunk);
    perFileCount.set(chunk.filepath, count + 1);
    if (selected.length >= maxChunks) break;
  }

  return selected;
}

export async function runScan(options: RunScanOptions): Promise<ScanResult> {
  const start = Date.now();
  const config = await loadConfig({
    projectRoot: options.projectRoot,
    configPath: options.configPath,
    overrides: options.overrides
  });

  const log = options.logger ?? (() => {});

  const staticFindings = await runStaticScanners(config, config.projectRoot, log);

  const files = await discoverFiles({
    root: config.projectRoot,
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
    const scannedChunks = allChunks.length;

    if (!allChunks.length || !config.sampling.queries.length) {
      return {
        findings: toStaticFindings(staticFindings),
        scannedFiles: files.length,
        scannedChunks,
        durationMs: Date.now() - start
      };
    }

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

    const selectedChunks = pickChunks(
      db.getChunksByIds(orderedIds),
      orderedIds,
      config.sampling.maxChunks,
      config.sampling.maxChunksPerFile
    );

    if (!selectedChunks.length) {
      return {
        findings: toStaticFindings(staticFindings),
        scannedFiles: files.length,
        scannedChunks,
        durationMs: Date.now() - start
      };
    }

    const staticSummary = summarizeStaticFindings(staticFindings);
    const messages = buildScanMessages(selectedChunks, staticSummary);
    const response = await runChatCompletion(config, messages);
    const chunkMap = new Map(selectedChunks.map((chunk) => [chunk.id, chunk]));
    const findings: Finding[] = parseFindings(response, chunkMap);

    return {
      findings: [...toStaticFindings(staticFindings), ...findings],
      scannedFiles: files.length,
      scannedChunks,
      durationMs: Date.now() - start
    };
  } finally {
    db.close();
  }
}

function toStaticFindings(staticFindings: StaticFinding[]): Finding[] {
  return staticFindings.map((finding) => ({
    id: `${finding.tool}:${finding.ruleId}:${finding.filepath}:${finding.startLine}:${finding.endLine}`,
    title: `${finding.tool}: ${finding.ruleId}`,
    severity: finding.severity,
    description: finding.message,
    location: {
      filepath: finding.filepath,
      startLine: finding.startLine,
      endLine: finding.endLine
    },
    evidence: finding.snippet,
    remediation: undefined,
    source: "static",
    chunkId: null
  }));
}
