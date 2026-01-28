import type Database from "better-sqlite3";
import { StorageEmbeddingInsertError } from "../errors/storage.errors.js";

type VectorMode = "fast" | "portable";

type EmbeddingRepositoryOptions = {
  db: Database.Database;
  log: (message: string) => void;
  getVectorMode: () => VectorMode;
  toSqliteInteger: (value: unknown) => number | bigint | null;
};

export class EmbeddingRepository {
  private db: Database.Database;
  private log: (message: string) => void;
  private getVectorMode: () => VectorMode;
  private toSqliteInteger: (value: unknown) => number | bigint | null;

  constructor(options: EmbeddingRepositoryOptions) {
    this.db = options.db;
    this.log = options.log;
    this.getVectorMode = options.getVectorMode;
    this.toSqliteInteger = options.toSqliteInteger;
  }

  insertEmbeddings(rows: Array<{ chunkId: number; embedding: Buffer }>) {
    const isFast = this.getVectorMode() === "fast";
    const insert = isFast
      ? this.db.prepare("INSERT INTO chunk_embeddings (rowid, embedding) VALUES (?, ?)")
      : this.db.prepare("INSERT OR REPLACE INTO chunk_embeddings (chunk_id, embedding) VALUES (?, ?)");

    const normalized: Array<{ chunkId: number | bigint; embedding: Buffer }> = [];
    const seen = new Set<string>();
    let duplicateCount = 0;

    for (const row of rows) {
      const chunkId = this.toSqliteInteger(row.chunkId);
      if (chunkId == null) {
        this.log(`Skipping embedding insert: invalid chunkId (${typeof row.chunkId}).`);
        continue;
      }
      const key = String(chunkId);
      if (seen.has(key)) {
        duplicateCount += 1;
        continue;
      }
      seen.add(key);
      normalized.push({ chunkId, embedding: row.embedding });
    }

    if (isFast && normalized.length > 0) {
      const ids = normalized.map((row) => row.chunkId);
      const batchSize = 500;
      for (let i = 0; i < ids.length; i += batchSize) {
        const batch = ids.slice(i, i + batchSize);
        const placeholder = batch.map(() => "?").join(",");
        try {
          this.db.prepare(`DELETE FROM chunk_embeddings WHERE rowid IN (${placeholder})`).run(...batch);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const vectorMode = this.getVectorMode();
          this.log(`Embedding delete failed (mode=${vectorMode}): ${message}`);
        }
      }
    }

    let alreadyExists = 0;

    const tx = this.db.transaction(() => {
      for (const row of normalized) {
        try {
          insert.run(row.chunkId, row.embedding);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (isFast && /already exists/i.test(message)) {
            alreadyExists += 1;
            continue;
          }
          const vectorMode = this.getVectorMode();
          const errorMessage = `Embedding insert failed (mode=${vectorMode}, chunkId=${row.chunkId}): ${message}`;
          this.log(errorMessage);
          throw new StorageEmbeddingInsertError(errorMessage);
        }
      }
    });

    tx();
    if (duplicateCount > 0) {
      this.log(`Dropped ${duplicateCount} duplicate embeddings in batch.`);
    }
    if (alreadyExists > 0) {
      this.log(`Skipped ${alreadyExists} embeddings that already existed (fast mode).`);
    }
  }

  querySimilar(embedding: Buffer, limit: number): Array<{ chunkId: number; distance: number }> {
    if (this.getVectorMode() === "fast") {
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
}
