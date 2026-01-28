import path from "node:path";
import { mkdirSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import Database from "better-sqlite3";
import { MetaRepository } from "../repositories/metaRepository.js";
import { FileRepository } from "../repositories/fileRepository.js";
import { ChunkRepository } from "../repositories/chunkRepository.js";
import { EmbeddingRepository } from "../repositories/embeddingRepository.js";
import type { FileRow } from "../repositories/fileRepository.js";
import type { ChunkRow } from "../repositories/chunkRepository.js";
export type { FileRow } from "../repositories/fileRepository.js";
export type { ChunkRow } from "../repositories/chunkRepository.js";

const CURRENT_SCHEMA_VERSION = 2;

export interface DbOptions {
  stateDir: string;
  extensionPath?: string | null;
  vectorDimensions: number;
  vectorMaxElements?: number;
  logger?: (message: string) => void;
}

export class HadrixDb {
  private db: Database.Database;
  private metaRepository: MetaRepository;
  private fileRepository: FileRepository;
  private chunkRepository: ChunkRepository;
  private embeddingRepository: EmbeddingRepository;
  private vectorDimensions: number;
  private vectorMaxElements: number;
  private embeddingReset = false;
  private vectorMode: "fast" | "portable" = "portable";
  private fallbackNotified = false;

  constructor(private options: DbOptions) {
    mkdirSync(options.stateDir, { recursive: true });
    const dbPath = path.join(options.stateDir, "index.db");
    this.db = new Database(dbPath);
    this.metaRepository = new MetaRepository(this.db);
    this.fileRepository = new FileRepository(this.db);
    this.chunkRepository = new ChunkRepository({
      db: this.db,
      log: this.log.bind(this),
      getVectorMode: () => this.vectorMode,
      toSqliteInteger: this.toSqliteInteger.bind(this)
    });
    this.embeddingRepository = new EmbeddingRepository({
      db: this.db,
      log: this.log.bind(this),
      getVectorMode: () => this.vectorMode,
      toSqliteInteger: this.toSqliteInteger.bind(this)
    });
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

    this.metaRepository.ensureTable();

    this.runMigrations();

    const existingDims = this.metaRepository.get("embedding_dimensions");
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

    this.metaRepository.set("embedding_dimensions", String(this.vectorDimensions));
  }

  private runMigrations() {
    const rawVersion = this.metaRepository.get("schema_version");
    const parsed = rawVersion ? Number(rawVersion) : 0;
    let version = Number.isFinite(parsed) ? parsed : 0;

    if (version < CURRENT_SCHEMA_VERSION) {
      this.ensureChunkMetadataColumns();
      version = CURRENT_SCHEMA_VERSION;
    }

    if (!rawVersion || version !== Number(rawVersion)) {
      this.metaRepository.set("schema_version", String(version));
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

  didResetEmbeddings(): boolean {
    return this.embeddingReset;
  }

  private log(message: string) {
    this.options.logger?.(message);
  }

  private notifyFallback() {
    if (this.fallbackNotified) return;
    this.log("Fast vector search unavailable; using portable mode.");
    this.fallbackNotified = true;
  }

  private normalizeRowId(value: unknown): number | null {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) return null;
      const truncated = Math.trunc(value);
      if (!Number.isSafeInteger(truncated)) return null;
      return truncated;
    }
    if (typeof value === "bigint") {
      const asNumber = Number(value);
      if (!Number.isSafeInteger(asNumber)) return null;
      return asNumber;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return null;
      const truncated = Math.trunc(parsed);
      if (!Number.isSafeInteger(truncated)) return null;
      return truncated;
    }
    return null;
  }

  private toSqliteInteger(value: unknown): number | bigint | null {
    const normalized = this.normalizeRowId(value);
    if (normalized == null) return null;
    if (this.vectorMode !== "fast") return normalized;
    return BigInt(normalized);
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
    return this.fileRepository.upsertFile(params);
  }

  getFileByPath(filePath: string): FileRow | null {
    return this.fileRepository.getFileByPath(filePath);
  }

  getChunkFormatForFile(fileId: number): string | null {
    return this.chunkRepository.getChunkFormatForFile(fileId);
  }

  deleteChunksForFile(fileId: number) {
    this.chunkRepository.deleteChunksForFile(fileId);
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
    return this.chunkRepository.insertChunks(fileId, filepath, chunks);
  }

  insertEmbeddings(rows: Array<{ chunkId: number; embedding: Buffer }>) {
    this.embeddingRepository.insertEmbeddings(rows);
  }

  getChunksForFile(fileId: number): ChunkRow[] {
    return this.chunkRepository.getChunksForFile(fileId);
  }

  getAllChunks(): ChunkRow[] {
    return this.chunkRepository.getAllChunks();
  }

  querySimilar(embedding: Buffer, limit: number): Array<{ chunkId: number; distance: number }> {
    return this.embeddingRepository.querySimilar(embedding, limit);
  }

  getChunksByIds(ids: number[]): ChunkRow[] {
    return this.chunkRepository.getChunksByIds(ids);
  }

  close() {
    this.db.close();
  }
}
