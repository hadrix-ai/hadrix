import crypto from "node:crypto";
import path from "node:path";
import { readFileSync } from "node:fs";
import type { Chunk } from "../types.js";

interface ChunkOptions {
  maxChars: number;
  overlapChars: number;
  idPath?: string;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function computeOverlapLines(lines: string[], start: number, end: number, overlapChars: number): number {
  let total = 0;
  let count = 0;
  for (let i = end; i >= start; i -= 1) {
    total += lines[i].length;
    count += 1;
    if (total >= overlapChars) break;
  }
  return count;
}

export function chunkFile(filePath: string, options: ChunkOptions): Chunk[] {
  const raw = readFileSync(filePath, "utf-8");
  const lines = raw.split(/\r?\n/);
  const chunks: Chunk[] = [];
  const idPath = options.idPath ?? filePath;
  let startIndex = 0;
  let chunkIndex = 0;

  while (startIndex < lines.length) {
    let charCount = 0;
    let endIndex = startIndex;
    while (endIndex < lines.length) {
      const nextLen = lines[endIndex].length + 1;
      if (charCount + nextLen > options.maxChars && endIndex > startIndex) break;
      charCount += nextLen;
      endIndex += 1;
      if (charCount >= options.maxChars) break;
    }

    const chunkLines = lines.slice(startIndex, endIndex);
    const content = chunkLines.join("\n");
    const startLine = startIndex + 1;
    const endLine = endIndex;
    const contentHash = sha256(content);
    const chunkId = sha256(`${idPath}:${startLine}:${endLine}:${contentHash}`);

    chunks.push({
      id: chunkId,
      filepath: idPath,
      chunkIndex,
      startLine,
      endLine,
      content,
      contentHash,
      chunkFormat: "line_window"
    });

    if (endIndex >= lines.length) break;

    const overlapLines = computeOverlapLines(lines, startIndex, endIndex - 1, options.overlapChars);
    const nextStart = Math.max(startIndex + 1, endIndex - overlapLines);
    startIndex = nextStart;
    chunkIndex += 1;
  }

  return chunks;
}

export function hashFile(filePath: string): string {
  const raw = readFileSync(filePath, "utf-8");
  return sha256(raw);
}

export function toRelative(root: string, filePath: string): string {
  const rel = path.relative(root, filePath);
  return rel.split(path.sep).join("/");
}
