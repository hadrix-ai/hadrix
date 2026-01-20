import path from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";

export interface DbOptions {
  stateDir: string;
  extensionPath: string;
  vectorDimensions: number;
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

    try {
      this.db.loadExtension(this.options.extensionPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to load SQLite vector extension at ${this.options.extensionPath}. ${message}`
      );
    }

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
      this.resetEmbeddings();
      this.embeddingReset = true;
    }

    this.setMeta("embedding_dimensions", String(this.vectorDimensions));

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS chunk_embeddings
      USING vss0(embedding(${this.vectorDimensions}));
    `);
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

  private resetEmbeddings() {
    this.db.exec("DELETE FROM chunk_embeddings;");
  }

  didResetEmbeddings(): boolean {
    return this.embeddingReset;
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
      this.db.prepare(`DELETE FROM chunk_embeddings WHERE rowid IN (${placeholder})`).run(...ids);
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
    const insert = this.db.prepare("INSERT INTO chunk_embeddings (rowid, embedding) VALUES (?, ?)");

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
    return this.db
      .prepare("SELECT rowid as chunkId, distance FROM chunk_embeddings WHERE vss_search(embedding, ?) LIMIT ?")
      .all(embedding, limit) as Array<{ chunkId: number; distance: number }>;
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
