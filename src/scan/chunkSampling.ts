import type { RepositoryFileSample } from "../types.js";
import { splitSecurityHeader } from "./securityHeader.js";

type LocalChunk = {
  filepath: string;
  chunkIndex: number;
  startLine: number;
  endLine: number;
  content: string;
  chunkFormat?: string | null;
  overlapGroupId?: string | null;
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
const CHUNK_HTTP_METHOD_PATTERNS: Record<string, RegExp[]> = {
  GET: [
    /\bexport\s+async\s+function\s+GET\b/i,
    /\brouter\.get\s*\(/i,
    /\bapp\.get\s*\(/i,
    /\bmethod\s*===\s*['"]GET['"]/i
  ],
  POST: [
    /\bexport\s+async\s+function\s+POST\b/i,
    /\brouter\.post\s*\(/i,
    /\bapp\.post\s*\(/i,
    /\bmethod\s*===\s*['"]POST['"]/i
  ],
  PUT: [
    /\bexport\s+async\s+function\s+PUT\b/i,
    /\brouter\.put\s*\(/i,
    /\bapp\.put\s*\(/i,
    /\bmethod\s*===\s*['"]PUT['"]/i
  ],
  PATCH: [
    /\bexport\s+async\s+function\s+PATCH\b/i,
    /\brouter\.patch\s*\(/i,
    /\bapp\.patch\s*\(/i,
    /\bmethod\s*===\s*['"]PATCH['"]/i
  ],
  DELETE: [
    /\bexport\s+async\s+function\s+DELETE\b/i,
    /\brouter\.(delete|del)\s*\(/i,
    /\bapp\.(delete|del)\s*\(/i,
    /\bmethod\s*===\s*['"]DELETE['"]/i
  ],
  OPTIONS: [
    /\bexport\s+async\s+function\s+OPTIONS\b/i,
    /\brouter\.options\s*\(/i,
    /\bapp\.options\s*\(/i,
    /\bmethod\s*===\s*['"]OPTIONS['"]/i
  ],
  HEAD: [
    /\bexport\s+async\s+function\s+HEAD\b/i,
    /\brouter\.head\s*\(/i,
    /\bapp\.head\s*\(/i,
    /\bmethod\s*===\s*['"]HEAD['"]/i
  ]
};
const CHUNK_EXTERNAL_CALL_PATTERNS = [
  /\bfetch\s*\(/i,
  /\baxios\b/i,
  /\bgot\s*\(/i,
  /\brequest\s*\(/i,
  /\bhttp\.request\s*\(/i,
  /\bhttps\.request\s*\(/i
];
const CHUNK_WEBHOOK_PATTERNS = [/\bwebhook\b/i];
const CHUNK_WEBHOOK_CONFIG_PATTERNS = [
  /\bconfigUrl\w*\b/i,
  /\bconfig_url\w*\b/i,
  /\bconfigUri\w*\b/i,
  /\bconfig_uri\w*\b/i,
  /\bconfigEndpoint\b/i,
  /\bwebhookConfig\w*\b/i,
  /\bconfig\s*(?:\?\.|\.)\s*(url|uri|endpoint|link)\b/i,
  /\bconfig\s*\[\s*['"](url|uri|endpoint|link)['"]\s*\]/i,
  /\b(payload|body|event\.payload|event\.data|req\.body|request\.body)\s*(?:\?\.|\.)\s*config\w*\b/i,
  /\b(payload|body|event\.payload|event\.data|req\.body|request\.body)\s*(?:\?\.|\.)\s*config\s*(?:\?\.|\.)\s*(url|uri|endpoint|link)\b/i
];
const CHUNK_AUTH_PATTERNS = [/\bauth\b/i, /\bjwt\b/i, /\btoken\b/i, /\bsession\b/i];
const CHUNK_ADMIN_PATTERNS = [/\badmin\b/i, /\brole\b/i, /\bpermission\b/i, /\bclaims\b/i];
const CHUNK_TOKEN_PATTERNS = [
  /\btoken\b/i,
  /\bsecret\b/i,
  /\bapi[_-]?key\b/i,
  /\baccess[_-]?token\b/i,
  /\brefresh[_-]?token\b/i,
  /\bbearer\b/i,
  /\bauthorization\b/i
];
const CHUNK_WEAK_TOKEN_PATTERNS = [/Math\.random\s*\(/i, /\bDate\.now\s*\(/i];
const CHUNK_REQUEST_BODY_PATTERNS = [
  /\brequest\.json\s*\(/i,
  /\breq\.body\b/i,
  /\brequest\.body\b/i,
  /\bctx\.request\.body\b/i,
  /\bformData\s*\(/i,
  /\bpayload\b/i
];
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
const CHUNK_DANGEROUS_PATTERNS = [
  /\bdangerouslySetInnerHTML\b/i,
  /\beval\s*\(/i,
  /\bnew Function\b/i,
  /\bMath\.random\s*\(/i,
  /\bDate\.now\s*\(/i,
  /\bconsole\.(log|info|warn|error|debug)\b[^\n]{0,80}\b(token|secret|api[_-]?key|password|authorization|bearer)\b/i,
  /\blogger\.[^\n]{0,80}\b(token|secret|api[_-]?key|password|authorization|bearer)\b/i
];

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

function isSecurityChunk(chunk: LocalChunk): boolean {
  return chunk.chunkFormat === "security_semantic";
}

function stripSecurityHeader(content: string): string {
  if (!content) {
    return "";
  }
  const { body } = splitSecurityHeader(content);
  return body;
}

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function detectChunkMethods(content: string): Set<string> {
  const methods = new Set<string>();
  if (!content) return methods;
  for (const [method, patterns] of Object.entries(CHUNK_HTTP_METHOD_PATTERNS)) {
    if (patterns.some((pattern) => pattern.test(content))) {
      methods.add(method);
    }
  }
  return methods;
}

function hasRequestBodySignal(content: string): boolean {
  if (!content) return false;
  if (matchesAnyPattern(content, CHUNK_REQUEST_BODY_PATTERNS)) {
    return true;
  }
  if (matchesAnyPattern(content, CHUNK_LOG_PATTERNS)) {
    return matchesAnyPattern(content, CHUNK_REQUEST_BODY_PATTERNS);
  }
  return false;
}

function buildSecurityChunkIndex(chunks: LocalChunk[]): Map<string, LocalChunk[]> {
  const index = new Map<string, LocalChunk[]>();
  for (const chunk of chunks) {
    if (!chunk.filepath || !isSecurityChunk(chunk)) continue;
    if (!index.has(chunk.filepath)) {
      index.set(chunk.filepath, []);
    }
    index.get(chunk.filepath)!.push(chunk);
  }
  for (const list of index.values()) {
    list.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }
  return index;
}

function pickOverlappingChunk(source: LocalChunk, candidates: LocalChunk[]): LocalChunk | null {
  const start = source.startLine;
  const end = source.endLine;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  let best: { chunk: LocalChunk; overlap: number } | null = null;
  for (const candidate of candidates) {
    const overlap = Math.min(end, candidate.endLine) - Math.max(start, candidate.startLine) + 1;
    if (overlap <= 0) continue;
    if (!best || overlap > best.overlap) {
      best = { chunk: candidate, overlap };
    }
  }
  return best?.chunk ?? null;
}

function alignPreferredChunks(preferred: LocalChunk[], allChunks: LocalChunk[]): LocalChunk[] {
  if (!preferred.length) {
    return preferred;
  }
  const securityByFile = buildSecurityChunkIndex(allChunks);
  if (!securityByFile.size) {
    return preferred;
  }
  return preferred.map((chunk) => {
    if (!chunk.filepath || isSecurityChunk(chunk)) {
      return chunk;
    }
    const candidates = securityByFile.get(chunk.filepath);
    if (!candidates || candidates.length === 0) {
      return chunk;
    }
    const body = stripSecurityHeader(chunk.content ?? "");
    const isEndpoint = body ? matchesAnyPattern(body, CHUNK_ENDPOINT_PATTERNS) : false;
    if (isEndpoint && chunk.overlapGroupId) {
      const overlapMatch = candidates.find(
        (candidate) => candidate.overlapGroupId && candidate.overlapGroupId === chunk.overlapGroupId
      );
      if (overlapMatch) {
        return overlapMatch;
      }
    }
    return pickOverlappingChunk(chunk, candidates) ?? candidates[0];
  });
}

function preferSecurityChunks(chunks: LocalChunk[]): LocalChunk[] {
  if (!chunks.length) {
    return chunks;
  }
  const securityFiles = new Set<string>();
  for (const chunk of chunks) {
    if (chunk.filepath && isSecurityChunk(chunk)) {
      securityFiles.add(chunk.filepath);
    }
  }
  if (!securityFiles.size) {
    return chunks;
  }
  return chunks.filter((chunk) => {
    if (!chunk.filepath) return false;
    if (!securityFiles.has(chunk.filepath)) return true;
    return isSecurityChunk(chunk);
  });
}

function scoreChunk(chunk: LocalChunk): number {
  const path = chunk.filepath.toLowerCase();
  let score = 0;
  if (path.endsWith(".ts") || path.endsWith(".tsx") || path.endsWith(".js") || path.endsWith(".jsx")) {
    score += 5;
  }
  if (path.includes("/db/") || path.endsWith("schema.sql")) {
    score += 6;
  }
  if (path.includes("/src/") || path.startsWith("src/") || path.includes("/service/") || path.includes("/ui/")) {
    score += 4;
  }
  if (path.includes("/functions") || path.includes("/api/") || path.includes("/edge/")) {
    score += 3;
  }
  if (path.includes("webhook")) {
    score += 3;
  }
  if (path.includes("package-lock") || path.includes("pnpm-lock") || path.includes("yarn.lock")) {
    score -= 6;
  }
  if (path.includes("node_modules") || path.includes(".next") || path.includes("dist/")) {
    score -= 10;
  }

  const content = stripSecurityHeader(chunk.content ?? "");
  if (content) {
    const hasEndpoint = matchesAnyPattern(content, CHUNK_ENDPOINT_PATTERNS);
    if (hasEndpoint) {
      score += 4;
    }
    if (hasEndpoint && chunk.overlapGroupId) {
      score += 2;
    }
    if (matchesAnyPattern(content, CHUNK_WEBHOOK_PATTERNS)) {
      score += 2;
    }
    if (matchesAnyPattern(content, CHUNK_AUTH_PATTERNS)) {
      score += 3;
    }
    if (matchesAnyPattern(content, CHUNK_TOKEN_PATTERNS)) {
      score += 2;
    }
    if (matchesAnyPattern(content, CHUNK_WEAK_TOKEN_PATTERNS)) {
      score += 3;
    }
    if (matchesAnyPattern(content, CHUNK_REQUEST_BODY_PATTERNS)) {
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
    if (matchesAnyPattern(content, CHUNK_LOG_PATTERNS) && matchesAnyPattern(content, CHUNK_TOKEN_PATTERNS)) {
      score += 2;
    }
    if (matchesAnyPattern(content, CHUNK_VULN_TOGGLE_PATTERNS)) {
      score += 2;
    }
    if (matchesAnyPattern(content, CHUNK_DANGEROUS_PATTERNS)) {
      score += 2;
    }
    const hasWebhookConfig = matchesAnyPattern(content, CHUNK_WEBHOOK_CONFIG_PATTERNS);
    if (hasWebhookConfig) {
      score += 5;
    }
    const hasExternalCall = matchesAnyPattern(content, CHUNK_EXTERNAL_CALL_PATTERNS);
    if (hasWebhookConfig && hasExternalCall) {
      score += 6;
    }
  }

  const folder = topLevelFolder(chunk.filepath);
  if (folder) {
    score += 1;
  }
  return score;
}

function isWebhookConfigChunk(chunk: LocalChunk): boolean {
  const path = chunk.filepath.toLowerCase();
  const content = stripSecurityHeader(chunk.content ?? "");
  if (!content) return false;
  const hasConfig = matchesAnyPattern(content, CHUNK_WEBHOOK_CONFIG_PATTERNS);
  const hasExternalCall = matchesAnyPattern(content, CHUNK_EXTERNAL_CALL_PATTERNS);
  if (hasConfig) return true;
  return path.includes("webhook") && hasExternalCall;
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
    if (!existing) {
      firstChunks.set(chunk.filepath, chunk);
      continue;
    }
    const existingScore = scoreChunk(existing);
    const candidateScore = scoreChunk(chunk);
    if (
      candidateScore > existingScore ||
      (candidateScore === existingScore && chunk.chunkIndex < existing.chunkIndex)
    ) {
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
    if (list.length <= maxChunksPerFile) {
      expanded.push(...list);
      continue;
    }
    const seedIndex = list.findIndex((chunk) => chunk.chunkIndex === seed.chunkIndex);
    if (seedIndex === -1) {
      for (let i = 0; i < list.length && i < maxChunksPerFile; i += 1) {
        expanded.push(list[i]);
      }
      continue;
    }
    const windowSize = Math.max(1, maxChunksPerFile);
    let start = Math.max(0, seedIndex - Math.floor((windowSize - 1) / 2));
    let end = Math.min(list.length, start + windowSize);
    if (end - start < windowSize) {
      start = Math.max(0, end - windowSize);
    }
    for (let i = start; i < end; i += 1) {
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
  const scoresByPath = new Map<string, number>();
  for (const chunk of selected) {
    if (!chunk.filepath) continue;
    const score = scoreChunk(chunk);
    if (score < HIGH_RISK_CHUNK_SCORE) continue;
    const current = scoresByPath.get(chunk.filepath) ?? Number.NEGATIVE_INFINITY;
    if (score > current) {
      scoresByPath.set(chunk.filepath, score);
    }
  }
  if (scoresByPath.size === 0) {
    return [];
  }

  const ranked = Array.from(scoresByPath.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([filepath]) => filepath);
  const targets = ranked.slice(0, Math.max(0, maxExtraChunks));

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
  for (const filepath of targets) {
    if (extras.length >= maxExtraChunks) break;
    const list = chunksByFile.get(filepath) ?? [];
    const extra = list.find((candidate) => candidate.chunkIndex > 0);
    if (extra) {
      extras.push(extra);
    }
  }

  return extras;
}

function pickBestChunk(candidates: LocalChunk[]): LocalChunk | null {
  if (candidates.length === 0) return null;
  let best = candidates[0];
  let bestScore = scoreChunk(best);
  for (let i = 1; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    const score = scoreChunk(candidate);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

function pickHandlerSignalChunks(chunks: LocalChunk[]): LocalChunk[] {
  const chunksByFile = new Map<string, LocalChunk[]>();
  for (const chunk of chunks) {
    if (!chunk.filepath || !chunk.content) continue;
    if (!chunksByFile.has(chunk.filepath)) {
      chunksByFile.set(chunk.filepath, []);
    }
    chunksByFile.get(chunk.filepath)!.push(chunk);
  }

  const extras: LocalChunk[] = [];
  for (const list of chunksByFile.values()) {
    const methodsByChunk = new Map<LocalChunk, Set<string>>();
    const fileMethods = new Set<string>();
    for (const chunk of list) {
      const body = stripSecurityHeader(chunk.content ?? "");
      const methods = detectChunkMethods(body);
      methodsByChunk.set(chunk, methods);
      for (const method of methods) {
        fileMethods.add(method);
      }
    }

    if (fileMethods.size < 2) continue;
    const hasWrite = Array.from(fileMethods).some((method) => WRITE_METHODS.has(method));
    if (!hasWrite) continue;

    const requestBodyChunks = list.filter((chunk) =>
      hasRequestBodySignal(stripSecurityHeader(chunk.content ?? ""))
    );
    const writeChunks = list.filter((chunk) => {
      const methods = methodsByChunk.get(chunk);
      if (!methods || methods.size === 0) return false;
      return Array.from(methods).some((method) => WRITE_METHODS.has(method));
    });
    const writeWithBody = writeChunks.filter((chunk) =>
      hasRequestBodySignal(stripSecurityHeader(chunk.content ?? ""))
    );

    const preferredWrite = pickBestChunk(writeWithBody) ?? pickBestChunk(writeChunks);
    const preferredBody = pickBestChunk(requestBodyChunks);

    if (preferredWrite) {
      extras.push(preferredWrite);
    }
    if (preferredBody && preferredBody !== preferredWrite) {
      extras.push(preferredBody);
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
  const normalized = allChunks.map((chunk) => ({
    ...chunk,
    filepath: normalizePath(chunk.filepath),
    chunkFormat: chunk.chunkFormat ?? null
  }));

  const filtered = preferSecurityChunks(
    normalized.filter((chunk) => chunk.filepath && !shouldIgnoreSamplePath(chunk.filepath))
  );

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

  const webhookPreferred = preferSecurityChunks(
    alignPreferredChunks(filtered.filter((chunk) => isWebhookConfigChunk(chunk)), filtered)
  );
  const preferred = (options.preferredChunks ?? []).map((chunk) => ({
    ...chunk,
    filepath: normalizePath(chunk.filepath),
    chunkFormat: chunk.chunkFormat ?? null
  }));
  const alignedPreferred = preferSecurityChunks(alignPreferredChunks(preferred, filtered));
  const handlerPreferred = preferSecurityChunks(
    alignPreferredChunks(pickHandlerSignalChunks(filtered), filtered)
  );

  const combinedPreferred = mergeChunkSelection(
    handlerPreferred,
    mergeChunkSelection(webhookPreferred, alignedPreferred)
  );
  const combined = mergeChunkSelection(combinedPreferred, expanded);
  const capped = capChunks(combined, maxFiles, maxChunksPerFile);

  return capped.map((chunk) => ({
    path: chunk.filepath,
    content: chunk.content,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    chunkIndex: chunk.chunkIndex,
    truncated: chunk.chunkIndex > 0,
    overlapGroupId: chunk.overlapGroupId ?? null
  }));
}

export function toLocalChunk(record: {
  filepath: string;
  chunk_index: number;
  start_line: number;
  end_line: number;
  content: string;
  chunk_format?: string | null;
  overlap_group_id?: string | null;
}): LocalChunk {
  return {
    filepath: record.filepath,
    chunkIndex: record.chunk_index,
    startLine: record.start_line,
    endLine: record.end_line,
    content: record.content,
    chunkFormat: record.chunk_format ?? null,
    overlapGroupId: record.overlap_group_id ?? null
  };
}

export function isCodeFilepath(filepath: string): boolean {
  const lower = filepath.toLowerCase();
  const base = lower.split("/").pop() ?? "";
  const ext = base.includes(".") ? base.split(".").pop() ?? "" : "";
  return CODE_EXTENSIONS.has(ext);
}
