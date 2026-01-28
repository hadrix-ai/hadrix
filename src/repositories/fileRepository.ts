import type Database from "better-sqlite3";

export interface FileRow {
  id: number;
  path: string;
  hash: string;
  mtimeMs: number;
  size: number;
}

export class FileRepository {
  constructor(private db: Database.Database) {}

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
}
