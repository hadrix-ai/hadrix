import path from "node:path";
import { mkdirSync } from "node:fs";
import Database from "better-sqlite3";
import type { Logger } from "../logging/logger.js";

const CURRENT_SCHEMA_VERSION = 2;

export interface DbOptions {
  stateDir: string;
  logger?: Logger;
}

export interface FileRow {
  id: number;
  path: string;
  hash: string;
  mtimeMs: number;
  size: number;
}

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

export class HadrixDb {
  private db: Database.Database;

  constructor(private options: DbOptions) {
    mkdirSync(options.stateDir, { recursive: true });
    const dbPath = path.join(options.stateDir, "index.db");
    this.db = new Database(dbPath);
    this.init();
  }

  private log(message: string) {
    this.options.logger?.debug(message);
  }

  close() {
    this.db.close();
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
        chunk_format TEXT,
        security_header TEXT,
        primary_symbol TEXT,
        entry_point TEXT,
        execution_role TEXT,
        sinks TEXT,
        overlap_group_id TEXT,
        dedupe_key TEXT,
        created_at TEXT NOT NULL
      );
    `);

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);

    this.runMigrations();

    // Embeddings removed: drop any leftover table from previous runs.
    try {
      this.db.exec("DROP TABLE IF EXISTS chunk_embeddings;");
    } catch {
      // ignore
    }
  }

  private runMigrations() {
    const rawVersion = this.getMeta("schema_version");
    const parsed = rawVersion ? Number(rawVersion) : 0;
    let version = Number.isFinite(parsed) ? parsed : 0;

    if (version < CURRENT_SCHEMA_VERSION) {
      this.ensureChunkMetadataColumns();
      version = CURRENT_SCHEMA_VERSION;
    }

    if (!rawVersion || version !== Number(rawVersion)) {
      this.setMeta("schema_version", String(version));
    }
  }

  private ensureChunkMetadataColumns() {
    const columns = [
      { name: "chunk_format", type: "TEXT" },
      { name: "security_header", type: "TEXT" },
      { name: "primary_symbol", type: "TEXT" },
      { name: "entry_point", type: "TEXT" },
      { name: "execution_role", type: "TEXT" },
      { name: "sinks", type: "TEXT" },
      { name: "overlap_group_id", type: "TEXT" },
      { name: "dedupe_key", type: "TEXT" }
    ];

    for (const column of columns) {
      if (this.tableHasColumn("chunks", column.name)) continue;
      this.db.exec(`ALTER TABLE chunks ADD COLUMN ${column.name} ${column.type}`);
    }
  }

  private tableHasColumn(table: string, column: string): boolean {
    const rows = this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === column);
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

  getFileByPath(filePath: string): FileRow | null {
    const row = this.db
      .prepare("SELECT id, path, hash, mtime_ms as mtimeMs, size FROM files WHERE path = ?")
      .get(filePath) as FileRow | undefined;
    return row ?? null;
  }

  upsertFile(input: { path: string; hash: string; mtimeMs: number; size: number }): FileRow {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO files (path, hash, mtime_ms, size, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET
           hash = excluded.hash,
           mtime_ms = excluded.mtime_ms,
           size = excluded.size,
           updated_at = excluded.updated_at`
      )
      .run(input.path, input.hash, input.mtimeMs, input.size, now);

    const row = this.getFileByPath(input.path);
    if (!row) {
      throw new Error("Failed to upsert file row");
    }
    return row;
  }

  deleteChunksForFile(fileId: number) {
    this.db.prepare("DELETE FROM chunks WHERE file_id = ?").run(fileId);
  }

  getChunkFormatForFile(fileId: number): string | null {
    const row = this.db
      .prepare("SELECT chunk_format as chunkFormat FROM chunks WHERE file_id = ? LIMIT 1")
      .get(fileId) as { chunkFormat: string | null } | undefined;
    return row?.chunkFormat ?? null;
  }

  private normalizeOptionalString(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private serializeOptionalJson(value: unknown): string | null {
    if (value == null) return null;
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return null;
    }
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
      chunkFormat: string | null;
      securityHeader: unknown;
      primarySymbol: unknown;
      entryPoint: unknown;
      executionRole: unknown;
      sinks: unknown;
      overlapGroupId: unknown;
      dedupeKey: unknown;
    }>
  ): Array<{ id: number; chunkUid: string }> {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO chunks (
        file_id,
        chunk_uid,
        filepath,
        chunk_index,
        start_line,
        end_line,
        content,
        content_hash,
        chunk_format,
        security_header,
        primary_symbol,
        entry_point,
        execution_role,
        sinks,
        overlap_group_id,
        dedupe_key,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const selectId = this.db.prepare("SELECT id FROM chunks WHERE chunk_uid = ?");

    const now = new Date().toISOString();
    const inserted: Array<{ id: number; chunkUid: string }> = [];
    const tx = this.db.transaction(() => {
      const seen = new Set<string>();
      for (const chunk of chunks) {
        if (seen.has(chunk.chunkUid)) continue;
        seen.add(chunk.chunkUid);

        insert.run(
          fileId,
          chunk.chunkUid,
          filepath,
          chunk.chunkIndex,
          chunk.startLine,
          chunk.endLine,
          chunk.content,
          chunk.contentHash,
          this.normalizeOptionalString(chunk.chunkFormat),
          this.serializeOptionalJson(chunk.securityHeader),
          this.normalizeOptionalString(chunk.primarySymbol),
          this.normalizeOptionalString(chunk.entryPoint),
          this.normalizeOptionalString(chunk.executionRole),
          this.serializeOptionalJson(chunk.sinks),
          this.normalizeOptionalString(chunk.overlapGroupId),
          this.normalizeOptionalString(chunk.dedupeKey),
          now
        );

        const row = selectId.get(chunk.chunkUid) as { id: number } | undefined;
        if (row?.id) inserted.push({ id: row.id, chunkUid: chunk.chunkUid });
      }
    });
    tx();
    return inserted;
  }

  getAllChunks(): ChunkRow[] {
    return this.db
      .prepare(
        `SELECT
          id,
          chunk_uid,
          filepath,
          chunk_index,
          start_line,
          end_line,
          content,
          chunk_format,
          security_header,
          primary_symbol,
          entry_point,
          execution_role,
          sinks,
          overlap_group_id,
          dedupe_key
        FROM chunks`
      )
      .all() as ChunkRow[];
  }

  getChunksByIds(ids: number[]): ChunkRow[] {
    if (!ids.length) return [];
    const placeholders = ids.map(() => "?").join(",");
    return this.db
      .prepare(
        `SELECT
          id,
          chunk_uid,
          filepath,
          chunk_index,
          start_line,
          end_line,
          content,
          chunk_format,
          security_header,
          primary_symbol,
          entry_point,
          execution_role,
          sinks,
          overlap_group_id,
          dedupe_key
        FROM chunks WHERE id IN (${placeholders})`
      )
      .all(...ids) as ChunkRow[];
  }
}
