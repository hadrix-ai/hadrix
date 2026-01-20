import path from "node:path";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

export interface DbOptions {
  stateDir: string;
  extensionPath?: string | null;
  vectorDimensions: number;
  logger?: (message: string) => void;
}

export interface FileRow {
  id: number;
  path: string;
  hash: string;
  mtimeMs: number;
  size: number;
}

export class HadrixDb {
  private db: Database.Database;
  private vectorDimensions: number;
  private embeddingReset = false;
  private vectorMode: "fast" | "portable" = "portable";
  private fallbackNotified = false;

  constructor(private options: DbOptions) {
    mkdirSync(options.stateDir, { recursive: true });
    const dbPath = path.join(options.stateDir, "index.db");
    this.db = new Database(dbPath);
    this.vectorDimensions = options.vectorDimensions;
    this.init();
  }

  private init() {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        hash TEXT NOT NULL,
        mtime_ms INTEGER NOT NULL,
        size INTEGER NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY,
        file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
        chunk_uid TEXT UNIQUE NOT NULL,
        filepath TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    const existingDims = this.getMeta("embedding_dimensions");
    if (existingDims && Number(existingDims) !== this.vectorDimensions) {
      try {
        this.db.exec("DROP TABLE IF EXISTS chunk_embeddings;");
      } catch {
        // Ignore drop failures; we can still fall back to portable mode.
      }
      this.embeddingReset = true;
    }

    const fastEnabled = this.tryEnableFastVectorSearch();
    if (fastEnabled) {
      this.vectorMode = "fast";
      if (!this.ensureEmbeddingsTable("fast")) {
        this.vectorMode = "portable";
        this.notifyFallback();
        this.ensureEmbeddingsTable("portable");
      }
    } else {
      this.vectorMode = "portable";
      this.notifyFallback();
      this.ensureEmbeddingsTable("portable");
    }

    this.setMeta("embedding_dimensions", String(this.vectorDimensions));
  }

  private setMeta(key: string, value: string) {
    this.db
      .prepare("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  private getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  didResetEmbeddings(): boolean {
    return this.embeddingReset;
  }

  private notifyFallback() {
    if (this.fallbackNotified) return;
    this.options.logger?.("Fast vector search unavailable; using portable mode.");
    this.fallbackNotified = true;
  }

  private bufferToFloat32(buffer: Buffer): Float32Array {
    const slice = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    );
    return new Float32Array(slice);
  }

  private cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    const length = Math.min(a.length, b.length);
    for (let i = 0; i < length; i += 1) {
      const av = a[i] ?? 0;
      const bv = b[i] ?? 0;
      dot += av * bv;
      normA += av * av;
      normB += bv * bv;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private tryEnableFastVectorSearch(): boolean {
    if (this.options.extensionPath) {
      try {
        this.db.loadExtension(this.options.extensionPath);
        return true;
      } catch {
        return false;
      }
    }

    try {
      const require = createRequire(import.meta.url);
      const mod = require("sqlite-vec");
      const sqliteVec = (mod?.default ?? mod) as { load?: (db: Database.Database) => void };
      if (typeof sqliteVec.load === "function") {
        sqliteVec.load(this.db);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  private ensureEmbeddingsTable(mode: "fast" | "portable"): boolean {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'chunk_embeddings' AND type = 'table'")
      .get() as { sql?: string } | undefined;

    const existingSql = row?.sql?.toLowerCase() ?? "";
    const isVecTable = existingSql.includes("vec0");

    if (mode === "fast" && row && !isVecTable) {
      try {
        this.db.exec("DROP TABLE IF EXISTS chunk_embeddings;");
      } catch {
        // Ignore drop failures; we'll fall back if needed.
      }
      this.embeddingReset = true;
    }

    if (mode === "portable" && row && isVecTable) {
      try {
        this.db.exec("DROP TABLE IF EXISTS chunk_embeddings;");
      } catch {
        // Ignore drop failures; we'll fall back if needed.
      }
      this.embeddingReset = true;
    }

    if (mode === "fast") {
      try {
        this.db.exec(`
          CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings
          USING vec0(
            chunk_id integer primary key,
            embedding float[${this.vectorDimensions}] distance_metric=cosine
          );
        `);
        return true;
      } catch {
        return false;
      }
    }

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS chunk_embeddings (
        chunk_id INTEGER PRIMARY KEY,
        embedding BLOB NOT NULL
      );
    `);
    return true;
  }

  upsertFile(params: { path: string; hash: string; mtimeMs: number; size: number }): FileRow {
    const existing = this.db
      .prepare("SELECT id, path, hash, mtime_ms as mtimeMs, size FROM files WHERE path = ?")
      .get(params.path) as FileRow | undefined;

    if (!existing) {
      const result = this.db
        .prepare(
          "INSERT INTO files (path, hash, mtime_ms, size, updated_at) VALUES (?, ?, ?, ?, datetime('now'))"
        )
        .run(params.path, params.hash, params.mtimeMs, params.size);

      return {
        id: Number(result.lastInsertRowid),
        path: params.path,
        hash: params.hash,
        mtimeMs: params.mtimeMs,
        size: params.size
      };
    }

    if (existing.hash !== params.hash) {
      this.db
        .prepare(
          "UPDATE files SET hash = ?, mtime_ms = ?, size = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(params.hash, params.mtimeMs, params.size, existing.id);

      return { ...existing, hash: params.hash, mtimeMs: params.mtimeMs, size: params.size };
    }

    return existing;
  }

  getFileByPath(filePath: string): FileRow | null {
    const row = this.db
      .prepare("SELECT id, path, hash, mtime_ms as mtimeMs, size FROM files WHERE path = ?")
      .get(filePath) as FileRow | undefined;
    return row ?? null;
  }

  deleteChunksForFile(fileId: number) {
    const rows = this.db
      .prepare("SELECT id FROM chunks WHERE file_id = ?")
      .all(fileId) as Array<{ id: number }>;

    if (rows.length) {
      const ids = rows.map((row) => row.id);
      const placeholder = ids.map(() => "?").join(",");
      if (this.vectorMode === "fast") {
        this.db.prepare(`DELETE FROM chunk_embeddings WHERE chunk_id IN (${placeholder})`).run(...ids);
      } else {
        this.db.prepare(`DELETE FROM chunk_embeddings WHERE chunk_id IN (${placeholder})`).run(...ids);
      }
    }

    this.db.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
  }

  insertChunks(
    fileId: number,
    filepath: string,
    chunks: Array<{ chunkUid: string; chunkIndex: number; startLine: number; endLine: number; content: string; contentHash: string }>
  ): Array<{ id: number; chunkUid: string }> {
    const insertChunk = this.db.prepare(
      "INSERT INTO chunks (file_id, chunk_uid, filepath, chunk_index, start_line, end_line, content, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    );

    const inserted: Array<{ id: number; chunkUid: string }> = [];

    const tx = this.db.transaction(() => {
      for (const chunk of chunks) {
        const result = insertChunk.run(
          fileId,
          chunk.chunkUid,
          filepath,
          chunk.chunkIndex,
          chunk.startLine,
          chunk.endLine,
          chunk.content,
          chunk.contentHash
        );
        inserted.push({ id: Number(result.lastInsertRowid), chunkUid: chunk.chunkUid });
      }
    });

    tx();
    return inserted;
  }

  insertEmbeddings(rows: Array<{ chunkId: number; embedding: Buffer }>) {
    const insert =
      this.vectorMode === "fast"
        ? this.db.prepare("INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)")
        : this.db.prepare("INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)");

    const tx = this.db.transaction(() => {
      for (const row of rows) {
        insert.run(row.chunkId, row.embedding);
      }
    });

    tx();
  }

  getChunksForFile(fileId: number): Array<{ id: number; chunk_uid: string; filepath: string; start_line: number; end_line: number; content: string; chunk_index: number }> {
    return this.db
      .prepare(
        "SELECT id, chunk_uid, filepath, start_line, end_line, content, chunk_index FROM chunks WHERE file_id = ? ORDER BY chunk_index"
      )
      .all(fileId) as Array<{ id: number; chunk_uid: string; filepath: string; start_line: number; end_line: number; content: string; chunk_index: number }>;
  }

  getAllChunks(): Array<{ id: number; chunk_uid: string; filepath: string; start_line: number; end_line: number; content: string; chunk_index: number }> {
    return this.db
      .prepare(
        "SELECT id, chunk_uid, filepath, start_line, end_line, content, chunk_index FROM chunks ORDER BY filepath, chunk_index"
      )
      .all() as Array<{ id: number; chunk_uid: string; filepath: string; start_line: number; end_line: number; content: string; chunk_index: number }>;
  }

  querySimilar(embedding: Buffer, limit: number): Array<{ chunkId: number; distance: number }> {
    if (this.vectorMode === "fast") {
      return this.db
        .prepare("SELECT chunk_id as chunkId, distance FROM chunk_embeddings WHERE embedding MATCH ? AND k = ?")
        .all(embedding, limit) as Array<{ chunkId: number; distance: number }>;
    }

    const target = this.bufferToFloat32(embedding);
    const rows = this.db
      .prepare("SELECT chunk_id as chunkId, embedding FROM chunk_embeddings")
      .all() as Array<{ chunkId: number; embedding: Buffer }>;

    const scored: Array<{ chunkId: number; distance: number }> = [];
    for (const row of rows) {
      const vector = this.bufferToFloat32(row.embedding);
      if (vector.length !== target.length) continue;
      const distance = 1 - this.cosineSimilarity(target, vector);
      scored.push({ chunkId: row.chunkId, distance });
    }

    scored.sort((a, b) => a.distance - b.distance);
    return scored.slice(0, limit);
  }

  getChunksByIds(ids: number[]): Array<{ id: number; chunk_uid: string; filepath: string; start_line: number; end_line: number; content: string; chunk_index: number }> {
    if (!ids.length) return [];
    const placeholder = ids.map(() => "?").join(",");
    return this.db
      .prepare(
        `SELECT id, chunk_uid, filepath, start_line, end_line, content, chunk_index FROM chunks WHERE id IN (${placeholder})`
      )
      .all(...ids) as Array<{ id: number; chunk_uid: string; filepath: string; start_line: number; end_line: number; content: string; chunk_index: number }>;
  }

  close() {
    this.db.close();
  }
}
