import type { RepositoryFileSample } from "../types.js";

type LocalChunk = {
  filepath: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
};

export interface SampleSelectionOptions {
  maxFiles: number;
  maxChunksPerFile: number;
  preferredChunks?: LocalChunk[];
}

const CODE_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs", "cjs"]);
const IGNORED_SAMPLE_PATHS = ["expected_findings.json"];
const IGNORED_SAMPLE_DIRS = ["/vulnerabilities/"];
const HIGH_RISK_CHUNK_SCORE = 12;

const CHUNK_ENDPOINT_PATTERNS = [
  /\bDeno\.serve\b/i,
  /\brouter\.(get|post|put|patch|delete)\b/i,
  /\bapp\.(get|post|put|patch|delete)\b/i,
  /\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/i,
  /\breq\.method\b/i,
  /\baddEventListener\s*\(\s*['"]fetch['"]\s*\)/i
];
const CHUNK_AUTH_PATTERNS = [/\bauth\b/i, /\bjwt\b/i, /\btoken\b/i, /\bsession\b/i];
const CHUNK_ADMIN_PATTERNS = [/\badmin\b/i, /\brole\b/i, /\bpermission\b/i, /\bclaims\b/i];
const CHUNK_DATA_PATTERNS = [
  /\.from\s*\(/i,
  /\.select\s*\(/i,
  /\.insert\s*\(/i,
  /\.update\s*\(/i,
  /\.delete\s*\(/i,
  /\bsql\b/i,
  /\bquery\b/i
];
const CHUNK_EXEC_PATTERNS = [
  /\bexecSync\s*\(/i,
  /\bexec\s*\(/i,
  /\bspawnSync\s*\(/i,
  /\bspawn\s*\(/i,
  /\bDeno\.Command\b/i,
  /\bDeno\.run\b/i,
  /\bchild_process\b/i,
  /\bBun\.spawn\b/i
];
const CHUNK_LOG_PATTERNS = [/\bconsole\.(log|info|warn|error)\s*\(/i, /\blogger\./i];
const CHUNK_VULN_TOGGLE_PATTERNS = [/\bvulnEnabled\s*\(/i, /\bHADRIX_VULN\b/i];
const CHUNK_DANGEROUS_PATTERNS = [/\bdangerouslySetInnerHTML\b/i, /\beval\s*\(/i, /\bnew Function\b/i];

function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\/*/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

function shouldIgnoreSamplePath(filepath: string): boolean {
  const normalized = filepath.replace(/\\/g, "/").toLowerCase();
  if (IGNORED_SAMPLE_DIRS.some((dir) => normalized.includes(dir))) {
    return true;
  }
  return IGNORED_SAMPLE_PATHS.some(
    (name) => normalized.endsWith(`/${name}`) || normalized === name
  );
}

function matchesAnyPattern(content: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(content));
}

function scoreChunk(chunk: LocalChunk): number {
  const path = chunk.filepath.toLowerCase();
  let score = 0;
  if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".js") || path.endsWith(".jsx")) {
    score += 5;
  }
  if (path.includes("/src/") || path.startsWith("src/") || path.includes("/service/") || path.includes("/ui/")) {
    score += 4;
  }
  if (path.includes("/functions") || path.includes("/api/") || path.includes("/edge/")) {
    score += 3;
  }
  if (path.includes("package-lock") || path.includes("pnpm-lock") || path.includes("yarn.lock")) {
    score -= 6;
  }
  if (path.includes("node_modules") || path.includes(".next") || path.includes("dist/")) {
    score -= 10;
  }

  const content = chunk.content ?? "";
  if (content) {
    if (matchesAnyPattern(content, CHUNK_ENDPOINT_PATTERNS)) {
      score += 4;
    }
    if (matchesAnyPattern(content, CHUNK_AUTH_PATTERNS)) {
      score += 3;
    }
    if (matchesAnyPattern(content, CHUNK_DATA_PATTERNS)) {
      score += 3;
    }
    if (matchesAnyPattern(content, CHUNK_EXEC_PATTERNS)) {
      score += 4;
    }
    if (matchesAnyPattern(content, CHUNK_ADMIN_PATTERNS)) {
      score += 2;
    }
    if (matchesAnyPattern(content, CHUNK_LOG_PATTERNS)) {
      score += 1;
    }
    if (matchesAnyPattern(content, CHUNK_VULN_TOGGLE_PATTERNS)) {
      score += 2;
    }
    if (matchesAnyPattern(content, CHUNK_DANGEROUS_PATTERNS)) {
      score += 2;
    }
  }

  const folder = topLevelFolder(chunk.filepath);
  if (folder) {
    score += 1;
  }
  return score;
}

function topLevelFolder(filepath: string): string {
  const parts = filepath.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "<root>";
  }
  return parts[0] ?? "<root>";
}

function pickFirstChunkPerFile(chunks: LocalChunk[]): Map<string, LocalChunk> {
  const firstChunks = new Map<string, LocalChunk>();
  for (const chunk of chunks) {
    const existing = firstChunks.get(chunk.filepath);
    if (!existing || chunk.chunkIndex < existing.chunkIndex) {
      firstChunks.set(chunk.filepath, chunk);
    }
  }
  return firstChunks;
}

function selectRepresentativeChunks(chunks: LocalChunk[], maxFiles: number): LocalChunk[] {
  if (chunks.length === 0 || maxFiles <= 0) {
    return [];
  }

  const firstChunks = pickFirstChunkPerFile(chunks);
  const prioritized = Array.from(firstChunks.values()).sort((a, b) => scoreChunk(b) - scoreChunk(a));

  const byFolder = new Map<string, LocalChunk[]>();
  for (const chunk of prioritized) {
    const folder = topLevelFolder(chunk.filepath);
    if (!byFolder.has(folder)) {
      byFolder.set(folder, []);
    }
    byFolder.get(folder)!.push(chunk);
  }

  for (const queue of byFolder.values()) {
    queue.sort((a, b) => scoreChunk(b) - scoreChunk(a) || a.filepath.localeCompare(b.filepath));
  }

  const folderKeys = Array.from(byFolder.keys()).sort();
  const queues = folderKeys.map((key) => byFolder.get(key)!);
  const selected: LocalChunk[] = [];

  while (selected.length < maxFiles && queues.length > 0) {
    for (let i = 0; i < queues.length && selected.length < maxFiles; i += 1) {
      const next = queues[i].shift();
      if (next) {
        selected.push(next);
      }
      if (queues[i].length === 0) {
        queues.splice(i, 1);
        i -= 1;
      }
    }
  }

  if (selected.length < maxFiles) {
    const seenPaths = new Set(selected.map((chunk) => chunk.filepath));
    const remaining = Array.from(firstChunks.values())
      .filter((chunk) => !seenPaths.has(chunk.filepath))
      .sort((a, b) => a.filepath.localeCompare(b.filepath));
    for (const chunk of remaining) {
      if (selected.length >= maxFiles) break;
      selected.push(chunk);
    }
  }

  return selected.slice(0, maxFiles);
}

function expandChunkSelection(selected: LocalChunk[], allChunks: LocalChunk[], maxChunksPerFile: number): LocalChunk[] {
  const chunksByFile = new Map<string, LocalChunk[]>();
  for (const chunk of allChunks) {
    if (!chunk.filepath || !chunk.content) continue;
    if (!chunksByFile.has(chunk.filepath)) {
      chunksByFile.set(chunk.filepath, []);
    }
    chunksByFile.get(chunk.filepath)!.push(chunk);
  }

  for (const list of chunksByFile.values()) {
    list.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  const expanded: LocalChunk[] = [];
  for (const seed of selected) {
    const list = chunksByFile.get(seed.filepath) ?? [seed];
    for (let i = 0; i < list.length && i < maxChunksPerFile; i += 1) {
      expanded.push(list[i]);
    }
  }
  return expanded;
}

function mergeChunkSelection(selected: LocalChunk[], extras: LocalChunk[]): LocalChunk[] {
  const combined = [...selected, ...extras];
  const seen = new Set<string>();
  const deduped: LocalChunk[] = [];
  for (const chunk of combined) {
    if (!chunk.filepath) continue;
    const key = `${chunk.filepath}#${chunk.chunkIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(chunk);
  }
  return deduped;
}

function pickExtraChunksForHighRiskFiles(
  selected: LocalChunk[],
  allChunks: LocalChunk[],
  maxExtraChunks: number
): LocalChunk[] {
  const chunksByFile = new Map<string, LocalChunk[]>();
  for (const chunk of allChunks) {
    if (!chunk.filepath || !chunk.content) continue;
    if (!chunksByFile.has(chunk.filepath)) {
      chunksByFile.set(chunk.filepath, []);
    }
    chunksByFile.get(chunk.filepath)!.push(chunk);
  }

  for (const list of chunksByFile.values()) {
    list.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  const extras: LocalChunk[] = [];
  for (const chunk of selected) {
    if (extras.length >= maxExtraChunks) break;
    const score = scoreChunk(chunk);
    if (score < HIGH_RISK_CHUNK_SCORE) continue;
    const list = chunksByFile.get(chunk.filepath) ?? [];
    const extra = list.find((candidate) => candidate.chunkIndex > 0);
    if (extra) {
      extras.push(extra);
    }
  }

  return extras;
}

function capChunks(chunks: LocalChunk[], maxFiles: number, maxChunksPerFile: number): LocalChunk[] {
  const perFileCount = new Map<string, number>();
  const selectedFiles = new Set<string>();
  const result: LocalChunk[] = [];

  for (const chunk of chunks) {
    const filepath = normalizePath(chunk.filepath);
    if (!filepath) continue;
    const count = perFileCount.get(filepath) ?? 0;
    if (count >= maxChunksPerFile) continue;
    if (!selectedFiles.has(filepath) && selectedFiles.size >= maxFiles) {
      continue;
    }
    perFileCount.set(filepath, count + 1);
    selectedFiles.add(filepath);
    result.push({ ...chunk, filepath });
  }

  return result;
}

export function buildRepositoryFileSamples(
  allChunks: LocalChunk[],
  options: SampleSelectionOptions
): RepositoryFileSample[] {
  const filtered = allChunks
    .map((chunk) => ({ ...chunk, filepath: normalizePath(chunk.filepath) }))
    .filter((chunk) => chunk.filepath && !shouldIgnoreSamplePath(chunk.filepath));

  if (!filtered.length) {
    return [];
  }

  const maxFiles = Math.max(1, Math.trunc(options.maxFiles));
  const maxChunksPerFile = Math.max(1, Math.trunc(options.maxChunksPerFile));
  const selected = selectRepresentativeChunks(filtered, maxFiles);

  let expanded: LocalChunk[] = [];
  if (maxChunksPerFile <= 1) {
    const maxExtraChunks = Math.min(25, Math.max(8, Math.floor(maxFiles * 0.35)));
    const extras = pickExtraChunksForHighRiskFiles(selected, filtered, maxExtraChunks);
    expanded = mergeChunkSelection(selected, extras);
  } else {
    expanded = expandChunkSelection(selected, filtered, maxChunksPerFile);
  }

  const preferred = (options.preferredChunks ?? []).map((chunk) => ({
    ...chunk,
    filepath: normalizePath(chunk.filepath)
  }));

  const combined = mergeChunkSelection(expanded, preferred);
  const capped = capChunks(combined, maxFiles, maxChunksPerFile);

  return capped.map((chunk) => ({
    path: chunk.filepath,
    content: chunk.content,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    chunkIndex: chunk.chunkIndex,
    truncated: chunk.chunkIndex > 0
  }));
}

export function toLocalChunk(record: {
  filepath: string;
  chunk_index: number;
  start_line: number;
  end_line: number;
  content: string;
}): LocalChunk {
  return {
    filepath: record.filepath,
    chunkIndex: record.chunk_index,
    startLine: record.start_line,
    endLine: record.end_line,
    content: record.content
  };
}

export function isCodeFilepath(filepath: string): boolean {
  const lower = filepath.toLowerCase();
  const base = lower.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  return CODE_EXTENSIONS.has(ext);
}
