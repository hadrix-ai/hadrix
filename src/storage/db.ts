import path from "node:path";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import Database from "better-sqlite3";

const CURRENT_SCHEMA_VERSION = 2;

export interface DbOptions {
  stateDir: string;
  extensionPath?: string | null;
  vectorDimensions: number;
  vectorMaxElements?: number;
  logger?: (message: string) => void;
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
  private vectorDimensions: number;
  private vectorMaxElements: number;
  private embeddingReset = false;
  private vectorMode: "fast" | "portable" = "portable";
  private fallbackNotified = false;

  constructor(private options: DbOptions) {
    mkdirSync(options.stateDir, { recursive: true });
    const dbPath = path.join(options.stateDir, "index.db");
    this.db = new Database(dbPath);
    this.vectorDimensions = options.vectorDimensions;
    this.vectorMaxElements = options.vectorMaxElements ?? 200000;
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
      const mod = require("vectorlite");
      const vectorlite = (mod?.default ?? mod) as {
        vectorlitePath?: () => string;
      };

      if (typeof vectorlite.vectorlitePath === "function") {
        const loadable = vectorlite.vectorlitePath();
        if (loadable) {
          this.db.loadExtension(loadable);
          return true;
        }
      }

      const pkgPath = require.resolve("vectorlite/package.json");
      const pkgRoot = path.dirname(pkgPath);
      const candidate = this.findExtensionFile(pkgRoot);
      if (candidate) {
        this.db.loadExtension(candidate);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

  private findExtensionFile(root: string): string | null {
    const exts = process.platform === "win32" ? [".dll"] : process.platform === "darwin" ? [".dylib"] : [".so"];
    const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
    const maxDepth = 4;

    while (queue.length) {
      const next = queue.shift();
      if (!next) break;
      const { dir, depth } = next;
      if (depth > maxDepth) continue;
      let entries: string[] = [];
      try {
        entries = readdirSync(dir);
      } catch {
        continue;
      }

      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        let stat;
        try {
          stat = statSync(fullPath);
        } catch {
          continue;
        }
        if (stat.isDirectory()) {
          queue.push({ dir: fullPath, depth: depth + 1 });
          continue;
        }
        const lower = entry.toLowerCase();
        if (!lower.includes("vectorlite")) continue;
        if (exts.some((ext) => lower.endsWith(ext))) {
          return fullPath;
        }
      }
    }
    return null;
  }

  private ensureEmbeddingsTable(mode: "fast" | "portable"): boolean {
    const row = this.db
      .prepare("SELECT sql FROM sqlite_master WHERE name = 'chunk_embeddings' AND type = 'table'")
      .get() as { sql?: string } | undefined;

    const existingSql = row?.sql?.toLowerCase() ?? "";
    const isVecTable = existingSql.includes("vectorlite");

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
          USING vectorlite(
            embedding float32[${this.vectorDimensions}] cosine,
            hnsw(max_elements=${this.vectorMaxElements})
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
      const ids = rows.map((row) => row.id);
      const placeholder = ids.map(() => "?").join(",");
      if (this.vectorMode === "fast") {
        this.db.prepare(`DELETE FROM chunk_embeddings WHERE rowid IN (${placeholder})`).run(...ids);
      } else {
        this.db.prepare(`DELETE FROM chunk_embeddings WHERE chunk_id IN (${placeholder})`).run(...ids);
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
      "INSERT INTO chunks (file_id, chunk_uid, filepath, chunk_index, start_line, end_line, content, content_hash, chunk_format, security_header, primary_symbol, entry_point, execution_role, sinks, overlap_group_id, dedupe_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))"
    );

    const inserted: Array<{ id: number; chunkUid: string }> = [];

    const tx = this.db.transaction(() => {
      for (const chunk of chunks) {
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
        inserted.push({ id: Number(result.lastInsertRowid), chunkUid: chunk.chunkUid });
      }
    });

    tx();
    return inserted;
  }

  insertEmbeddings(rows: Array<{ chunkId: number; embedding: Buffer }>) {
    const insert =
      this.vectorMode === "fast"
        ? this.db.prepare("INSERT OR REPLACE INTO chunk_embeddings (rowid, embedding) VALUES (?, ?)")
        : this.db.prepare("INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)");

    const tx = this.db.transaction(() => {
      for (const row of rows) {
        insert.run(row.chunkId, row.embedding);
      }
    });

    tx();
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

  querySimilar(embedding: Buffer, limit: number): Array<{ chunkId: number; distance: number }> {
    if (this.vectorMode === "fast") {
      const k = Math.max(1, Math.floor(limit));
      return this.db
        .prepare(
          `SELECT rowid as chunkId, distance FROM chunk_embeddings WHERE knn_search(embedding, knn_param(?, ${k}))`
        )
        .all(embedding) as Array<{ chunkId: number; distance: number }>;
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

  getChunksByIds(ids: number[]): ChunkRow[] {
    if (!ids.length) return [];
    const placeholder = ids.map(() => "?").join(",");
    return this.db
      .prepare(
        `SELECT id, chunk_uid, filepath, start_line, end_line, content, chunk_index, chunk_format, security_header, primary_symbol, entry_point, execution_role, sinks, overlap_group_id, dedupe_key FROM chunks WHERE id IN (${placeholder})`
      )
      .all(...ids) as ChunkRow[];
  }

  close() {
    this.db.close();
  }
}
