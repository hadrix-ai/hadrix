import type Database from "better-sqlite3";
import { StorageEmbeddingsDeleteError } from "../errors/storage.errors.js";

type VectorMode = "fast" | "portable";

type ChunkRepositoryOptions = {
  db: Database.Database;
  log: (message: string) => void;
  getVectorMode: () => VectorMode;
  toSqliteInteger: (value: unknown) => number | bigint | null;
};

export interface ChunkRow {
  id: number;
  chunk_uid: string;
  filepath: string;
  chunk_index: number;
  start_line: number;
  end_line: number;
  content: string;
  chunk_format: string | null;
  security_header: string | null;
  primary_symbol: string | null;
  entry_point: string | null;
  execution_role: string | null;
  sinks: string | null;
  overlap_group_id: string | null;
  dedupe_key: string | null;
}

export class ChunkRepository {
  private db: Database.Database;
  private log: (message: string) => void;
  private getVectorMode: () => VectorMode;
  private toSqliteInteger: (value: unknown) => number | bigint | null;

  constructor(options: ChunkRepositoryOptions) {
    this.db = options.db;
    this.log = options.log;
    this.getVectorMode = options.getVectorMode;
    this.toSqliteInteger = options.toSqliteInteger;
  }

  getChunkFormatForFile(fileId: number): string | null {
    const row = this.db
      .prepare(
        "SELECT COUNT(*) as count, MIN(COALESCE(chunk_format, 'line_window')) as minFormat, MAX(COALESCE(chunk_format, 'line_window')) as maxFormat FROM chunks WHERE file_id = ?"
      )
      .get(fileId) as { count: number; minFormat: string | null; maxFormat: string | null } | undefined;
    if (!row || row.count === 0) {
      return null;
    }
    if (row.minFormat && row.minFormat === row.maxFormat) {
      return row.minFormat;
    }
    return null;
  }

  deleteChunksForFile(fileId: number) {
    const rows = this.db
      .prepare("SELECT id FROM chunks WHERE file_id = ?")
      .all(fileId) as Array<{ id: number }>;

    if (rows.length) {
      const ids = rows
        .map((row) => this.toSqliteInteger(row.id))
        .filter((id): id is number | bigint => id !== null);
      const invalidCount = rows.length - ids.length;
      if (invalidCount > 0) {
        this.log(`Skipping ${invalidCount} non-integer chunk ids for embeddings delete (fileId=${fileId}).`);
      }
      if (!ids.length) {
        this.log(`Skipping embeddings delete: no valid chunk ids (fileId=${fileId}).`);
        this.db.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
        return;
      }
      const placeholder = ids.map(() => "?").join(",");
      const vectorMode = this.getVectorMode();
      try {
        if (vectorMode === "fast") {
          this.db.prepare(`DELETE FROM chunk_embeddings WHERE rowid IN (${placeholder})`).run(...ids);
        } else {
          this.db.prepare(`DELETE FROM chunk_embeddings WHERE chunk_id IN (${placeholder})`).run(...ids);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const errorMessage = `Embeddings delete failed (mode=${vectorMode}, fileId=${fileId}): ${message}`;
        this.log(errorMessage);
        throw new StorageEmbeddingsDeleteError(errorMessage);
      }
    }

    this.db.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
  }

  insertChunks(
    fileId: number,
    filepath: string,
    chunks: Array<{
      chunkUid: string;
      chunkIndex: number;
      startLine: number;
      endLine: number;
      content: string;
      contentHash: string;
      chunkFormat?: string | null;
      securityHeader?: unknown;
      primarySymbol?: string | null;
      entryPoint?: string | null;
      executionRole?: string | null;
      sinks?: unknown;
      overlapGroupId?: string | null;
      dedupeKey?: string | null;
    }>
  ): Array<{ id: number; chunkUid: string }> {
    const insertChunk = this.db.prepare(
      "INSERT OR IGNORE INTO chunks (file_id, chunk_uid, filepath, chunk_index, start_line, end_line, content, content_hash, chunk_format, security_header, primary_symbol, entry_point, execution_role, sinks, overlap_group_id, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    );
    const selectChunkId = this.db.prepare("SELECT id FROM chunks WHERE chunk_uid = ?");

    const inserted: Array<{ id: number; chunkUid: string }> = [];
    let duplicateInBatch = 0;
    let existingCount = 0;
    let missingCount = 0;

    const tx = this.db.transaction(() => {
      const seen = new Set<string>();
      for (const chunk of chunks) {
        if (seen.has(chunk.chunkUid)) {
          duplicateInBatch += 1;
          continue;
        }
        seen.add(chunk.chunkUid);

        const chunkFormat = this.normalizeOptionalString(chunk.chunkFormat);
        const securityHeader = this.serializeOptionalJson(chunk.securityHeader);
        const primarySymbol = this.normalizeOptionalString(chunk.primarySymbol);
        const entryPoint = this.normalizeOptionalString(chunk.entryPoint);
        const executionRole = this.normalizeOptionalString(chunk.executionRole);
        const sinks = this.serializeOptionalJson(chunk.sinks);
        const overlapGroupId = this.normalizeOptionalString(chunk.overlapGroupId);
        const dedupeKey = this.normalizeOptionalString(chunk.dedupeKey);
        const result = insertChunk.run(
          fileId,
          chunk.chunkUid,
          filepath,
          chunk.chunkIndex,
          chunk.startLine,
          chunk.endLine,
          chunk.content,
          chunk.contentHash,
          chunkFormat,
          securityHeader,
          primarySymbol,
          entryPoint,
          executionRole,
          sinks,
          overlapGroupId,
          dedupeKey
        );
        if (result.changes === 0) {
          const row = selectChunkId.get(chunk.chunkUid) as { id: number } | undefined;
          if (row) {
            existingCount += 1;
            inserted.push({ id: Number(row.id), chunkUid: chunk.chunkUid });
          } else {
            missingCount += 1;
          }
        } else {
          inserted.push({ id: Number(result.lastInsertRowid), chunkUid: chunk.chunkUid });
        }
      }
    });

    tx();
    if (duplicateInBatch > 0) {
      this.log(`Dropped ${duplicateInBatch} duplicate chunk_uids within batch for ${filepath}.`);
    }
    if (existingCount > 0) {
      this.log(`Skipped ${existingCount} existing chunk_uids for ${filepath}.`);
    }
    if (missingCount > 0) {
      this.log(`Failed to resolve ${missingCount} chunk_uids after insert-ignore for ${filepath}.`);
    }
    return inserted;
  }

  getChunksForFile(fileId: number): ChunkRow[] {
    return this.db
      .prepare(
        "SELECT id, chunk_uid, filepath, start_line, end_line, content, chunk_index, chunk_format, security_header, primary_symbol, entry_point, execution_role, sinks, overlap_group_id, dedupe_key FROM chunks WHERE file_id = ? ORDER BY chunk_index"
      )
      .all(fileId) as ChunkRow[];
  }

  getAllChunks(): ChunkRow[] {
    return this.db
      .prepare(
        "SELECT id, chunk_uid, filepath, start_line, end_line, content, chunk_index, chunk_format, security_header, primary_symbol, entry_point, execution_role, sinks, overlap_group_id, dedupe_key FROM chunks ORDER BY filepath, chunk_index"
      )
      .all() as ChunkRow[];
  }

  getChunksByIds(ids: number[]): ChunkRow[] {
    if (!ids.length) return [];
    const placeholder = ids.map(() => "?").join(",");
    return this.db
      .prepare(
        `SELECT id, chunk_uid, filepath, start_line, end_line, content, chunk_index, chunk_format, security_header, primary_symbol, entry_point, execution_role, sinks, overlap_group_id, dedupe_key FROM chunks WHERE id IN (${placeholder})`
      )
      .all(...ids) as ChunkRow[];
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private serializeOptionalJson(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") return value;
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
  }
}
