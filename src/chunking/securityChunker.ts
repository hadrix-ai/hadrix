import crypto from "node:crypto";
import { readFileSync } from "node:fs";
import type { Chunk, SecurityHeader } from "../types.js";
import type { ReachabilityIndex, ReachabilityInfo } from "../scan/jellyReachability.js";
import { renderSecurityHeader } from "../scan/securityHeader.js";

type AnchorNode = {
  filePath: string;
  startLine: number;
  endLine: number;
  startColumn: number;
  endColumn: number;
};

type LocalFile = {
  filepath: string;
  absolutePath: string;
  content: string;
  lines: string[];
  lineOffsets: number[];
};

type ChunkRange = {
  startLine: number;
  endLine: number;
};

type SastHintKind = "generic" | "entrypoint" | "sink";

type SastHintRange = {
  startLine: number;
  endLine: number;
  kind: SastHintKind;
  entryType?: string | null;
  sinks?: string[];
};

type ChunkDraft = {
  filepath: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  chunkFormat: "security_semantic";
  securityHeader: SecurityHeader;
  primarySymbol: string | null;
  overlapGroupId: string | null;
  dedupeKey: string | null;
  entryPoint: string | null;
  executionRole: string | null;
  sinks: string[] | null;
};

export type SastFindingHint = {
  filepath: string;
  startLine: number;
  endLine?: number | null;
  ruleId?: string | null;
  message?: string | null;
};

export interface SecurityChunkFileOptions {
  filePath: string;
  idPath: string;
  repoPath?: string | null;
  content?: string;
  minChunkSize?: number;
  anchors?: AnchorNode[];
  sastFindings?: SastFindingHint[] | null;
  reachabilityIndex?: ReachabilityIndex | null;
}

const MAX_CHUNK_LINES = 160;
const OVERLAP_LINES = 40;
const SINK_CONTEXT_LINES = 30;
const MAX_CHUNKS_PER_ANCHOR = 6;
const SAST_CONTEXT_LINES = 24;
const MAX_SAST_HINTS_PER_FILE = 12;
const MAX_SAST_RANGES_PER_ANCHOR = 4;
const MAX_CALLEE_DEPTH = 2;
const MAX_CALLEE_ANCHORS = 6;
const MAX_CALLEE_RANGES_PER_ANCHOR = 6;
const DEFAULT_MIN_CHUNK_SIZE = 50;

const HTTP_ROUTE_PATTERNS = [
  /\brouter\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i,
  /\bapp\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/i,
  /\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/i,
  /\bDeno\.serve\b/i
];
const AUTH_PATTERNS = [
  /\bauth\b/i,
  /\bauthenticate\b/i,
  /\bauthorization\b/i,
  /\bclerk\b/i,
  /\bsupabase\.auth\b/i
];
const JWT_PATTERNS = [/\bjwt\b/i, /\bbearer\b/i, /\bAuthorization\b/i];
const SESSION_PATTERNS = [/\bsession\b/i, /\bcookie\b/i];
const API_KEY_PATTERNS = [/\bapi[-_ ]?key\b/i, /\bx-api-key\b/i];
const AUTHZ_PATTERNS = [
  /\bauthoriz(e|ation)\b/i,
  /\brole\b/i,
  /\bpermission\b/i,
  /\brbac\b/i,
  /\babac\b/i,
  /\bpolicy\b/i
];
const ADMIN_PATTERNS = [/\badmin\b/i, /\bisAdmin\b/i, /\badminOnly\b/i];
const VALIDATION_PATTERNS = [/\bvalidate\b/i, /\bzod\b/i, /\byup\b/i, /\bschema\b/i];

const INPUT_PATTERNS: Array<{ regex: RegExp; format: (match: RegExpMatchArray) => string }> = [
  {
    regex: /req\.body\.([A-Za-z0-9_]+)/g,
    format: (match) => `req.body.${match[1]}`
  },
  {
    regex: /req\.query\.([A-Za-z0-9_]+)/g,
    format: (match) => `req.query.${match[1]}`
  },
  {
    regex: /req\.params\.([A-Za-z0-9_]+)/g,
    format: (match) => `req.params.${match[1]}`
  },
  {
    regex: /req\.headers\.([A-Za-z0-9_-]+)/g,
    format: (match) => `req.headers.${match[1]}`
  },
  {
    regex: /req\.headers\[['"]([^'"]+)['"]\]/g,
    format: (match) => `req.headers.${match[1]}`
  },
  {
    regex: /request\.headers\.get\(\s*['"]([^'"]+)['"]\s*\)/g,
    format: (match) => `request.headers.${match[1]}`
  },
  {
    regex: /ctx\.params\.([A-Za-z0-9_]+)/g,
    format: (match) => `ctx.params.${match[1]}`
  },
  {
    regex: /searchParams\.get\(\s*['"]([^'"]+)['"]\s*\)/g,
    format: (match) => `searchParams.get("${match[1]}")`
  }
];

const SINK_PATTERNS: Array<{ label: string; regex: RegExp }> = [
  { label: "db.write", regex: /\bprisma\.\w+\.(create|update|delete|upsert)\b/i },
  { label: "db.query", regex: /\bprisma\.\w+\.(find|aggregate)\b/i },
  { label: "db.write", regex: /\.(insert|update|delete|upsert)\s*\(/i },
  { label: "db.query", regex: /\.(select|from)\s*\(/i },
  { label: "sql.query", regex: /\bquery\s*\(|\bexecute\s*\(/i },
  { label: "exec", regex: /\b(execSync|exec|spawnSync|spawn|child_process|Deno\.run|Bun\.spawn)\b/i },
  { label: "template.render", regex: /\bdangerouslySetInnerHTML\b|\bres\.send\b|\bres\.write\b/i },
  { label: "file.write", regex: /\bwriteFile(Sync)?\s*\(/i },
  { label: "http.request", regex: /\bfetch\b|\baxios\.\w+\b|\bgot\s*\(/i },
  {
    label: "log.write",
    regex: /\bconsole\.(log|info|warn|error|debug|trace)\s*\(|\blogger(?:\?\.|\.)\s*(info|warn|error|debug|log|trace)\s*\(|\blog(?:\?\.|\.)\s*(info|warn|error|debug|trace)\s*\(/i
  }
];

const SAST_ENTRYPOINT_HINTS: Array<{ entryType: string; patterns: RegExp[] }> = [
  {
    entryType: "webhook",
    patterns: [/\bwebhook\b/i, /\bsignature\b/i]
  },
  {
    entryType: "job",
    patterns: [/\bcron\b/i, /\bjob\b/i, /\bqueue\b/i, /\bworker\b/i, /\bscheduler\b/i]
  },
  {
    entryType: "cli",
    patterns: [/\bcli\b/i, /\bcommand[- ]?line\b/i]
  },
  {
    entryType: "rpc",
    patterns: [/\brpc\b/i, /\bgraphql\b/i, /\bgql\b/i, /\btrpc\b/i]
  },
  {
    entryType: "http",
    patterns: [
      /\broute\b/i,
      /\brouter\b/i,
      /\bendpoint\b/i,
      /\bhandler\b/i,
      /\bcontroller\b/i,
      /\bexpress\b/i,
      /\bfastify\b/i,
      /\bkoa\b/i,
      /\bhapi\b/i
    ]
  }
];

const SAST_ENTRYPOINT_PRIORITY = new Map<string, number>(
  SAST_ENTRYPOINT_HINTS.map((hint, index) => [hint.entryType, index])
);

const SAST_SINK_HINTS: Array<{ label: string; patterns: RegExp[] }> = [
  {
    label: "sql.query",
    patterns: [/\bsqli?\b/i, /\bsql[-_ ]?injection\b/i, /\bpostgres\b/i, /\bmysql\b/i, /\bsqlite\b/i]
  },
  {
    label: "db.write",
    patterns: [/\binsert\b/i, /\bupdate\b/i, /\bdelete\b/i, /\bupsert\b/i, /\bcreate\b/i]
  },
  {
    label: "db.query",
    patterns: [/\bselect\b/i, /\bquery\b/i, /\bfind\b/i, /\bwhere\b/i, /\bprisma\b/i, /\bsequelize\b/i, /\bknex\b/i]
  },
  {
    label: "exec",
    patterns: [/\bcommand\b/i, /\bexec\b/i, /\bshell\b/i, /\brce\b/i, /\bcode execution\b/i]
  },
  {
    label: "template.render",
    patterns: [/\bxss\b/i, /\bcross[- ]site scripting\b/i, /\btemplate injection\b/i, /\binnerhtml\b/i]
  },
  {
    label: "http.request",
    patterns: [/\bssrf\b/i, /\bserver[- ]side request\b/i, /\brequest forgery\b/i, /\bhttp request\b/i]
  },
  {
    label: "file.write",
    patterns: [/\bpath traversal\b/i, /\bdirectory traversal\b/i, /\bzip slip\b/i, /\bfile write\b/i]
  }
];

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function normalizeNewlines(value: string): string {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function normalizePath(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.?\/*/, "")
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "");
}

function normalizeRepoPath(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/\\/g, "/").trim().replace(/^[./]+/, "").replace(/\/+$/, "");
}

function isProbablyBinary(content: string): boolean {
  const sample = content.slice(0, 1024);
  let nonText = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 0) {
      return true;
    }
    if (code < 7 || (code > 13 && code < 32)) {
      nonText += 1;
    }
  }
  return nonText > sample.length * 0.1;
}

function isLikelyMinified(content: string): boolean {
  const lines = content.split("\n");
  if (lines.length <= 1) return false;
  const longest = lines.reduce((max, line) => Math.max(max, line.length), 0);
  return longest > 400 && longest > content.length * 0.4;
}

function computeLineOffsets(lines: string[]): number[] {
  const offsets: number[] = [];
  let cursor = 0;
  for (const line of lines) {
    offsets.push(cursor);
    cursor += line.length + 1;
  }
  return offsets;
}

function buildChunkRanges(startLine: number, endLine: number): ChunkRange[] {
  const ranges: ChunkRange[] = [];
  let cursor = startLine;
  while (cursor <= endLine) {
    const end = Math.min(endLine, cursor + MAX_CHUNK_LINES - 1);
    ranges.push({ startLine: cursor, endLine: end });
    if (end >= endLine) break;
    cursor = Math.max(cursor + 1, end - OVERLAP_LINES + 1);
  }
  return ranges;
}

function anchorKey(anchor: AnchorNode): string {
  return `${anchor.filePath}:${anchor.startLine}:${anchor.endLine}`;
}

function rangeKey(range: ChunkRange): string {
  return `${range.startLine}:${range.endLine}`;
}

function rangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
  return startA <= endB && endA >= startB;
}

function mergeUniqueStrings(base: string[], extra: string[]): string[] {
  if (extra.length === 0) return base;
  const merged = [...base];
  const seen = new Set(base);
  for (const item of extra) {
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    merged.push(item);
  }
  return merged;
}

function buildSastHintText(finding: SastFindingHint): string {
  const ruleId = typeof finding.ruleId === "string" ? finding.ruleId : "";
  const message = typeof finding.message === "string" ? finding.message : "";
  return `${ruleId} ${message}`.toLowerCase();
}

function detectSastEntryTypeHint(text: string): string | null {
  if (!text) return null;
  for (const hint of SAST_ENTRYPOINT_HINTS) {
    if (hint.patterns.some((pattern) => pattern.test(text))) {
      return hint.entryType;
    }
  }
  return null;
}

function detectSastSinkHints(text: string): string[] {
  if (!text) return [];
  const sinks = new Set<string>();
  for (const hint of SAST_SINK_HINTS) {
    if (hint.patterns.some((pattern) => pattern.test(text))) {
      sinks.add(hint.label);
    }
  }
  return Array.from(sinks);
}

function collectSastHints(findings?: SastFindingHint[] | null): Map<string, SastHintRange[]> {
  const byFile = new Map<string, Map<string, SastHintRange>>();
  if (!findings) return new Map();
  const kindRank: Record<SastHintKind, number> = {
    generic: 0,
    sink: 1,
    entrypoint: 2
  };

  for (const finding of findings) {
    if (!finding) continue;
    const filepath = normalizePath(finding.filepath ?? "");
    if (!filepath) continue;
    const startLine =
      typeof finding.startLine === "number" && Number.isFinite(finding.startLine)
        ? Math.trunc(finding.startLine)
        : 0;
    const endLineRaw =
      typeof finding.endLine === "number" && Number.isFinite(finding.endLine)
        ? Math.trunc(finding.endLine)
        : startLine;
    if (startLine <= 0) continue;
    const endLine = endLineRaw > 0 ? endLineRaw : startLine;
    const range: SastHintRange = {
      startLine: Math.min(startLine, endLine),
      endLine: Math.max(startLine, endLine),
      kind: "generic"
    };

    const hintText = buildSastHintText(finding);
    const entryType = detectSastEntryTypeHint(hintText);
    const sinkHints = detectSastSinkHints(hintText);
    const nextKind: SastHintKind = entryType ? "entrypoint" : sinkHints.length ? "sink" : "generic";

    const key = `${range.startLine}:${range.endLine}`;
    if (!byFile.has(filepath)) {
      byFile.set(filepath, new Map<string, SastHintRange>());
    }
    const existing = byFile.get(filepath)!.get(key);
    if (existing) {
      if (entryType && !existing.entryType) {
        existing.entryType = entryType;
      }
      if (sinkHints.length > 0) {
        existing.sinks = mergeUniqueStrings(existing.sinks ?? [], sinkHints);
      }
      if (kindRank[nextKind] > kindRank[existing.kind]) {
        existing.kind = nextKind;
      }
      continue;
    }

    const enriched: SastHintRange = {
      ...range,
      kind: nextKind,
      ...(entryType ? { entryType } : {}),
      ...(sinkHints.length ? { sinks: sinkHints } : {})
    };
    byFile.get(filepath)!.set(key, enriched);
  }

  const result = new Map<string, SastHintRange[]>();
  for (const [filepath, rangesMap] of byFile.entries()) {
    const ranges = Array.from(rangesMap.values());
    ranges.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
    if (ranges.length > MAX_SAST_HINTS_PER_FILE) {
      ranges.length = MAX_SAST_HINTS_PER_FILE;
    }
    result.set(filepath, ranges);
  }

  return result;
}

function buildSyntheticAnchors(
  file: LocalFile,
  anchors: AnchorNode[],
  hints: SastHintRange[]
): AnchorNode[] {
  if (hints.length === 0) return [];
  const anchorKeys = new Set(anchors.map(anchorKey));
  const uncovered: SastHintRange[] = [];

  for (const hint of hints) {
    const covered = anchors.some((anchor) =>
      rangesOverlap(anchor.startLine, anchor.endLine, hint.startLine, hint.endLine)
    );
    if (!covered) {
      uncovered.push(hint);
    }
  }

  if (uncovered.length === 0) return [];

  const syntheticRanges: SastHintRange[] = uncovered.map((hint) => ({
    startLine: Math.max(1, hint.startLine - SAST_CONTEXT_LINES),
    endLine: Math.min(file.lines.length, hint.endLine + SAST_CONTEXT_LINES),
    kind: hint.kind,
    entryType: hint.entryType ?? null,
    sinks: hint.sinks ?? []
  }));

  syntheticRanges.sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);

  const merged: SastHintRange[] = [];
  for (const range of syntheticRanges) {
    if (merged.length === 0) {
      merged.push({ ...range });
      continue;
    }
    const last = merged[merged.length - 1];
    if (range.startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, range.endLine);
    } else {
      merged.push({ ...range });
    }
  }

  const synthetic: AnchorNode[] = [];
  for (const range of merged.slice(0, MAX_SAST_HINTS_PER_FILE)) {
    const anchor: AnchorNode = {
      filePath: file.filepath,
      startLine: range.startLine,
      endLine: range.endLine,
      startColumn: 0,
      endColumn: 0
    };
    const key = anchorKey(anchor);
    if (anchorKeys.has(key)) continue;
    anchorKeys.add(key);
    synthetic.push(anchor);
  }

  return synthetic;
}

function selectSastHintsForAnchor(
  hints: SastHintRange[],
  startLine: number,
  endLine: number
): SastHintRange[] {
  if (hints.length === 0) return [];
  const selected: SastHintRange[] = [];
  for (const hint of hints) {
    if (!rangesOverlap(startLine, endLine, hint.startLine, hint.endLine)) {
      continue;
    }
    selected.push(hint);
    if (selected.length >= MAX_SAST_RANGES_PER_ANCHOR) {
      break;
    }
  }
  return selected;
}

function buildSastRanges(
  hints: SastHintRange[],
  startLine: number,
  endLine: number
): ChunkRange[] {
  const ranges: ChunkRange[] = [];
  for (const hint of hints) {
    const start = Math.max(startLine, hint.startLine - SAST_CONTEXT_LINES);
    const end = Math.min(endLine, hint.endLine + SAST_CONTEXT_LINES);
    if (end < start) continue;
    ranges.push({ startLine: start, endLine: end });
  }
  return ranges;
}

function buildAnchorSymbolIndex(
  file: LocalFile,
  anchors: AnchorNode[]
): {
  anchorBySymbol: Map<string, AnchorNode>;
  symbolByAnchorKey: Map<string, string>;
} {
  const anchorBySymbol = new Map<string, AnchorNode>();
  const symbolByAnchorKey = new Map<string, string>();
  for (const anchor of anchors) {
    const symbol = extractPrimarySymbol(file.lines, anchor.startLine);
    if (!symbol) continue;
    const key = anchorKey(anchor);
    symbolByAnchorKey.set(key, symbol);
    if (!anchorBySymbol.has(symbol)) {
      anchorBySymbol.set(symbol, anchor);
    }
  }
  return { anchorBySymbol, symbolByAnchorKey };
}

function getAnchorContent(file: LocalFile, anchor: AnchorNode): string {
  const startLine = Math.max(1, anchor.startLine);
  const endLine = Math.min(file.lines.length, anchor.endLine);
  if (endLine < startLine) return "";
  return file.lines.slice(startLine - 1, endLine).join("\n");
}

function extractCallNames(content: string, symbolSet: Set<string>, maxMatches: number): string[] {
  const results = new Set<string>();
  const regex = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  for (const match of content.matchAll(regex)) {
    const name = match[1];
    if (!symbolSet.has(name)) continue;
    results.add(name);
    if (results.size >= maxMatches) break;
  }
  return Array.from(results);
}

function collectCalleeAnchors(params: {
  file: LocalFile;
  anchor: AnchorNode;
  anchorBySymbol: Map<string, AnchorNode>;
  symbolByAnchorKey: Map<string, string>;
  maxDepth?: number;
  maxCallees?: number;
}): AnchorNode[] {
  const maxDepth = params.maxDepth ?? MAX_CALLEE_DEPTH;
  const maxCallees = params.maxCallees ?? MAX_CALLEE_ANCHORS;
  const symbolSet = new Set(params.anchorBySymbol.keys());
  const rootKey = anchorKey(params.anchor);
  const rootSymbol = params.symbolByAnchorKey.get(rootKey) ?? "";

  const queue: Array<{ symbol: string; depth: number }> = [];
  const visitedSymbols = new Set<string>();
  const visitedAnchors = new Set<string>([rootKey]);

  if (rootSymbol) {
    visitedSymbols.add(rootSymbol);
  }

  const rootContent = getAnchorContent(params.file, params.anchor);
  for (const name of extractCallNames(rootContent, symbolSet, 32)) {
    if (name === rootSymbol) continue;
    queue.push({ symbol: name, depth: 1 });
  }

  const callees: AnchorNode[] = [];
  while (queue.length > 0 && callees.length < maxCallees) {
    const current = queue.shift()!;
    if (current.depth > maxDepth) continue;
    if (visitedSymbols.has(current.symbol)) continue;
    visitedSymbols.add(current.symbol);
    const calleeAnchor = params.anchorBySymbol.get(current.symbol);
    if (!calleeAnchor) continue;
    const calleeKey = anchorKey(calleeAnchor);
    if (visitedAnchors.has(calleeKey)) continue;
    visitedAnchors.add(calleeKey);
    callees.push(calleeAnchor);

    if (current.depth >= maxDepth) continue;
    const calleeContent = getAnchorContent(params.file, calleeAnchor);
    for (const name of extractCallNames(calleeContent, symbolSet, 24)) {
      if (name === rootSymbol) continue;
      if (visitedSymbols.has(name)) continue;
      queue.push({ symbol: name, depth: current.depth + 1 });
    }
  }

  return callees;
}

function extractPrimarySymbol(lines: string[], startLine: number): string {
  const idx = Math.max(0, startLine - 1);
  const snippet = lines.slice(idx, Math.min(lines.length, idx + 4)).join(" ");
  const patterns = [
    /\bfunction\s+([A-Za-z0-9_$]+)/,
    /\bclass\s+([A-Za-z0-9_$]+)/,
    /\b([A-Za-z0-9_$]+)\s*=\s*async\s*\(/,
    /\b([A-Za-z0-9_$]+)\s*=\s*\(/,
    /\bexport\s+async\s+function\s+([A-Za-z0-9_$]+)/,
    /\bexport\s+function\s+([A-Za-z0-9_$]+)/
  ];
  for (const pattern of patterns) {
    const match = snippet.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  return "";
}

function extractRouteIdentifier(content: string, fallback: string): string {
  for (const pattern of HTTP_ROUTE_PATTERNS) {
    const match = content.match(pattern);
    if (!match) continue;
    if (match[1] && match[2]) {
      return `${String(match[1]).toUpperCase()} ${match[2]}`;
    }
    if (match[1]) {
      return `${String(match[1]).toUpperCase()} ${fallback}`;
    }
  }
  return fallback;
}

function collectInputSources(content: string): string[] {
  const sources = new Set<string>();
  for (const pattern of INPUT_PATTERNS) {
    pattern.regex.lastIndex = 0;
    const matches = content.matchAll(pattern.regex);
    for (const match of matches) {
      sources.add(pattern.format(match));
      if (sources.size >= 12) break;
    }
    if (sources.size >= 12) break;
  }
  if (sources.size === 0) {
    if (/\breq\.body\b/i.test(content)) sources.add("req.body");
    if (/\breq\.query\b/i.test(content)) sources.add("req.query");
    if (/\breq\.params\b/i.test(content)) sources.add("req.params");
  }
  return Array.from(sources);
}

function collectSinks(lines: string[], startLine: number): { sinks: string[]; sinkLines: number[] } {
  const sinkSet = new Set<string>();
  const sinkLines: number[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    for (const pattern of SINK_PATTERNS) {
      if (pattern.regex.test(line)) {
        sinkSet.add(pattern.label);
        const lineNumber = startLine + i;
        if (!sinkLines.includes(lineNumber)) {
          sinkLines.push(lineNumber);
        }
      }
    }
  }
  return { sinks: Array.from(sinkSet), sinkLines };
}

function mergeLineNumbers(base: number[], extra: number[]): number[] {
  if (extra.length === 0) return base;
  const seen = new Set(base);
  for (const line of extra) {
    if (Number.isFinite(line) && line > 0) {
      seen.add(line);
    }
  }
  return Array.from(seen).sort((a, b) => a - b);
}

function collectSastSinkHints(
  hints: SastHintRange[],
  startLine: number,
  endLine: number
): { sinks: string[]; sinkLines: number[] } {
  const sinkSet = new Set<string>();
  const lineSet = new Set<number>();
  for (const hint of hints) {
    if (!rangesOverlap(startLine, endLine, hint.startLine, hint.endLine)) {
      continue;
    }
    const hintSinks = hint.sinks ?? [];
    if (hintSinks.length === 0) {
      continue;
    }
    for (const sink of hintSinks) {
      if (sink) sinkSet.add(sink);
    }
    if (hint.startLine) lineSet.add(hint.startLine);
    if (hint.endLine && hint.endLine !== hint.startLine) {
      lineSet.add(hint.endLine);
    }
  }
  let sinkLines = Array.from(lineSet).sort((a, b) => a - b);
  if (sinkLines.length > MAX_SAST_RANGES_PER_ANCHOR) {
    sinkLines = sinkLines.slice(0, MAX_SAST_RANGES_PER_ANCHOR);
  }
  return { sinks: Array.from(sinkSet), sinkLines };
}

function collectSastEntryTypeHint(
  hints: SastHintRange[],
  startLine: number,
  endLine: number
): string | null {
  let selected: string | null = null;
  let selectedRank = Number.POSITIVE_INFINITY;
  for (const hint of hints) {
    if (!rangesOverlap(startLine, endLine, hint.startLine, hint.endLine)) {
      continue;
    }
    const entryType = hint.entryType;
    if (!entryType) continue;
    const rank = SAST_ENTRYPOINT_PRIORITY.get(entryType);
    if (typeof rank !== "number") continue;
    if (rank < selectedRank) {
      selectedRank = rank;
      selected = entryType;
    }
  }
  return selected;
}

function detectAuthLocation(content: string): string | undefined {
  const importMatch =
    content.match(/from\s+['"]([^'"]*(auth|session|jwt)[^'"]*)['"]/i) ??
    content.match(/require\(\s*['"]([^'"]*(auth|session|jwt)[^'"]*)['"]\s*\)/i);
  if (importMatch && importMatch[1]) {
    return importMatch[1];
  }
  return undefined;
}

function detectDataSensitivity(content: string, inputSources: string[]): string[] {
  const lowered = content.toLowerCase();
  const tokens = inputSources.join(" ").toLowerCase();
  const combined = `${lowered} ${tokens}`;
  const sensitivity: string[] = [];
  if (/(password|passwd|credential|secret)/.test(combined)) {
    sensitivity.push("credentials");
  }
  if (/(token|jwt|api[-_ ]?key)/.test(combined)) {
    sensitivity.push("tokens");
  }
  if (/(ssn|credit|card|iban|payment|billing)/.test(combined)) {
    sensitivity.push("financial");
  }
  if (/(email|phone|address|name|dob|birth|pii)/.test(combined)) {
    sensitivity.push("PII");
  }
  return sensitivity;
}

function detectTrustBoundaries(entryType: string, sinks: string[]): string[] {
  const boundaries: string[] = [];
  if (entryType === "http" || entryType === "rpc" || entryType === "webhook") {
    boundaries.push("Internet -> Application");
  }
  if (sinks.some((sink) => sink.startsWith("db") || sink.startsWith("sql"))) {
    boundaries.push("Application -> Database");
  }
  if (sinks.includes("http.request")) {
    boundaries.push("Application -> External Service");
  }
  if (sinks.includes("exec") || sinks.includes("file.write")) {
    boundaries.push("Application -> OS");
  }
  if (boundaries.length === 0) {
    boundaries.push("Application -> Internal");
  }
  return boundaries;
}

function buildSecurityAssumptions(args: {
  content: string;
  inputSources: string[];
  authEnforced: string;
}): string[] {
  const assumptions: string[] = [];
  const lowerInputs = args.inputSources.map((item) => item.toLowerCase()).join(" ");
  if (args.authEnforced === "true" && /user.?id/.test(lowerInputs)) {
    assumptions.push("userId corresponds to authenticated user");
  }
  if (args.authEnforced === "true" && /(org|tenant|workspace).?id/.test(lowerInputs)) {
    assumptions.push("orgId derived from authenticated session");
  }
  if (/email/.test(lowerInputs)) {
    assumptions.push("email validated upstream");
  }
  if (VALIDATION_PATTERNS.some((pattern) => pattern.test(args.content))) {
    assumptions.push("input validated upstream");
  }
  return assumptions.slice(0, 3);
}

function normalizeEntryTypeHint(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const allowed = new Set(["http", "rpc", "job", "webhook", "cli", "library"]);
  return allowed.has(normalized) ? normalized : null;
}

function buildSecurityHeader(params: {
  content: string;
  filepath: string;
  primarySymbol: string;
  sinks: string[];
  inputSources: string[];
  entryTypeHint?: string | null;
  reachability?: ReachabilityInfo | null;
}): SecurityHeader {
  const lowerPath = params.filepath.toLowerCase();
  const isWebhook = lowerPath.includes("webhook");
  const isJob =
    lowerPath.includes("job") ||
    lowerPath.includes("worker") ||
    lowerPath.includes("queue") ||
    lowerPath.includes("cron");
  const isCli = lowerPath.includes("cli") || /process\.argv/i.test(params.content);
  const entryTypeHint = normalizeEntryTypeHint(params.entryTypeHint);
  const entryType =
    entryTypeHint ??
    (isWebhook
      ? "webhook"
      : isJob
        ? "job"
        : isCli
          ? "cli"
          : HTTP_ROUTE_PATTERNS.some((pattern) => pattern.test(params.content)) ||
              lowerPath.includes("/api/")
            ? "http"
            : "library");

  const identifierBase = params.primarySymbol || params.filepath;
  const identifier =
    entryType === "http"
      ? extractRouteIdentifier(params.content, identifierBase)
      : entryType === "webhook"
        ? `webhook:${identifierBase}`
        : entryType === "job"
          ? `job:${identifierBase}`
          : entryType === "cli"
            ? `cli:${identifierBase}`
            : identifierBase;

  const authDetected =
    AUTH_PATTERNS.some((pattern) => pattern.test(params.content)) ||
    JWT_PATTERNS.some((pattern) => pattern.test(params.content)) ||
    SESSION_PATTERNS.some((pattern) => pattern.test(params.content)) ||
    API_KEY_PATTERNS.some((pattern) => pattern.test(params.content));
  const authEnforced =
    authDetected ? "true" : entryType === "http" || entryType === "webhook" ? "false" : "unclear";
  const authMechanism = JWT_PATTERNS.some((pattern) => pattern.test(params.content))
    ? "JWT"
    : API_KEY_PATTERNS.some((pattern) => pattern.test(params.content))
      ? "API key"
      : SESSION_PATTERNS.some((pattern) => pattern.test(params.content))
        ? "session"
        : authDetected
          ? "custom"
          : "none";
  const authLocation = detectAuthLocation(params.content);

  const authzDetected = AUTHZ_PATTERNS.some((pattern) => pattern.test(params.content));
  const authzModel = /rbac/i.test(params.content)
    ? "RBAC"
    : /abac/i.test(params.content)
      ? "ABAC"
      : authzDetected
        ? "custom"
        : "none";
  const authzEnforced = authzDetected ? "true" : entryType === "http" ? "unclear" : "false";

  const executionRole =
    entryType === "webhook"
      ? "external_service"
      : entryType === "job" || entryType === "cli"
        ? "system"
        : authEnforced === "true"
          ? ADMIN_PATTERNS.some((pattern) => pattern.test(params.content))
            ? "admin"
            : "authenticated_user"
          : "anonymous";

  const trustBoundaries = detectTrustBoundaries(entryType, params.sinks);
  const dataSensitivity = detectDataSensitivity(params.content, params.inputSources);
  const securityAssumptions = buildSecurityAssumptions({
    content: params.content,
    inputSources: params.inputSources,
    authEnforced
  });

  return {
    entry_point: { type: entryType, identifier },
    execution_role: executionRole,
    trust_boundaries: trustBoundaries,
    authentication: {
      enforced: authEnforced,
      mechanism: authMechanism,
      ...(authLocation ? { location: authLocation } : {})
    },
    authorization: {
      enforced: authzEnforced,
      model: authzModel
    },
    input_sources: params.inputSources,
    data_sensitivity: dataSensitivity,
    sinks: params.sinks,
    reachability: params.reachability ?? undefined,
    security_assumptions: securityAssumptions
  };
}

function normalizeKeyPart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\|/g, "/");
}

function buildChunkDedupeKey(params: {
  repoPath: string;
  filepath: string;
  primarySymbol: string;
  entryPoint: string;
  sinks: string[];
}): string {
  const parts = [
    normalizeKeyPart(params.repoPath || ""),
    normalizeKeyPart(params.filepath || ""),
    normalizeKeyPart(params.primarySymbol || ""),
    normalizeKeyPart(params.entryPoint || ""),
    normalizeKeyPart(params.sinks[0] || "")
  ];
  return parts.join("|");
}

function buildChunkId(idPath: string, startLine: number, endLine: number, contentHash: string): string {
  return sha256(`${idPath}:${startLine}:${endLine}:${contentHash}`);
}

function addChunkForRange(params: {
  chunks: ChunkDraft[];
  file: LocalFile;
  range: ChunkRange;
  header: SecurityHeader;
  overlapGroupId: string;
  primarySymbol: string;
  repoPath: string;
  minChunkSize: number;
}) {
  const { file, range } = params;
  if (range.endLine < range.startLine) return;
  const contentLines = file.lines.slice(range.startLine - 1, range.endLine);
  const code = contentLines.join("\n");
  if (code.trim().length < params.minChunkSize) return;

  const headerText = renderSecurityHeader(params.header);
  const content = `${headerText}\n\n${code}`;
  const entryPoint = params.header.entry_point?.identifier ?? null;
  const dedupeKey = buildChunkDedupeKey({
    repoPath: params.repoPath,
    filepath: file.filepath,
    primarySymbol: params.primarySymbol,
    entryPoint: entryPoint ?? "",
    sinks: params.header.sinks ?? []
  });

  params.chunks.push({
    filepath: file.filepath,
    startLine: range.startLine,
    endLine: range.endLine,
    content,
    contentHash: sha256(content),
    chunkFormat: "security_semantic",
    securityHeader: params.header,
    primarySymbol: params.primarySymbol || null,
    overlapGroupId: params.overlapGroupId,
    dedupeKey: dedupeKey || null,
    entryPoint,
    executionRole: params.header.execution_role ?? null,
    sinks: params.header.sinks ?? null
  });
}

export function securityChunkFile(options: SecurityChunkFileOptions): Chunk[] {
  const idPath = normalizePath(options.idPath);
  const repoPath = normalizeRepoPath(options.repoPath);
  const minChunkSize = Math.max(1, Math.trunc(options.minChunkSize ?? DEFAULT_MIN_CHUNK_SIZE));
  const raw = options.content ?? readFileSync(options.filePath, "utf-8");
  if (!raw) return [];
  const normalized = normalizeNewlines(raw);
  if (isProbablyBinary(normalized)) return [];
  if (isLikelyMinified(normalized)) return [];

  const lines = normalized.split("\n");
  const file: LocalFile = {
    filepath: idPath,
    absolutePath: options.filePath,
    content: normalized,
    lines,
    lineOffsets: computeLineOffsets(lines)
  };

  const hintsByFile = collectSastHints(options.sastFindings);
  const fileSastHints = hintsByFile.get(idPath) ?? [];

  const baseAnchors = options.anchors ?? [];
  const syntheticAnchors = buildSyntheticAnchors(file, baseAnchors, fileSastHints);
  const anchors = [...baseAnchors, ...syntheticAnchors];
  const { anchorBySymbol, symbolByAnchorKey } = buildAnchorSymbolIndex(file, anchors);

  const chunkDrafts: ChunkDraft[] = [];

  if (baseAnchors.length === 0) {
    const ranges = buildChunkRanges(1, file.lines.length);
    const overlapGroupId = crypto.randomUUID();
    const primarySymbol = file.filepath.split("/").pop() ?? file.filepath;
    const inputSources = collectInputSources(file.content);
    const { sinks: rawSinks } = collectSinks(file.lines, 1);
    const { sinks: sastSinks } = collectSastSinkHints(fileSastHints, 1, file.lines.length);
    const sinks = mergeUniqueStrings(rawSinks, sastSinks);
    const entryTypeHint = collectSastEntryTypeHint(fileSastHints, 1, file.lines.length);
    const reachability = options.reachabilityIndex?.getReachability({
      filepath: file.filepath,
      repoPath,
      startLine: 1,
      endLine: file.lines.length
    });
    const header = buildSecurityHeader({
      content: file.content,
      filepath: file.filepath,
      primarySymbol,
      sinks,
      inputSources,
      entryTypeHint,
      reachability
    });
    for (const range of ranges) {
      addChunkForRange({
        chunks: chunkDrafts,
        file,
        range,
        header,
        overlapGroupId,
        primarySymbol,
        repoPath,
        minChunkSize
      });
    }
    if (anchors.length === 0) {
      return finalizeChunks(chunkDrafts, idPath);
    }
  }

  for (const anchor of anchors) {
    const startLine = Math.max(1, anchor.startLine);
    const endLine = Math.min(file.lines.length, anchor.endLine);
    if (endLine < startLine) continue;
    const anchorLines = file.lines.slice(startLine - 1, endLine);
    const anchorContent = anchorLines.join("\n");
    if (anchorContent.trim().length < minChunkSize) {
      continue;
    }
    const primarySymbol = extractPrimarySymbol(file.lines, startLine) || file.filepath;
    const inputSources = collectInputSources(anchorContent);
    const { sinks: rawSinks, sinkLines } = collectSinks(anchorLines, startLine);
    const { sinks: sastSinks, sinkLines: sastSinkLines } = collectSastSinkHints(
      fileSastHints,
      startLine,
      endLine
    );
    const sinks = mergeUniqueStrings(rawSinks, sastSinks);
    const mergedSinkLines = mergeLineNumbers(sinkLines, sastSinkLines);
    const entryTypeHint = collectSastEntryTypeHint(fileSastHints, startLine, endLine);
    const reachability = options.reachabilityIndex?.getReachability({
      filepath: file.filepath,
      repoPath,
      startLine,
      endLine
    });
    const header = buildSecurityHeader({
      content: anchorContent,
      filepath: file.filepath,
      primarySymbol,
      sinks,
      inputSources,
      entryTypeHint,
      reachability
    });

    const baseRanges = buildChunkRanges(startLine, endLine);
    const sinkRanges = mergedSinkLines.map((line) => ({
      startLine: Math.max(startLine, line - SINK_CONTEXT_LINES),
      endLine: Math.min(endLine, line + SINK_CONTEXT_LINES)
    }));
    const sastHintsForAnchor = selectSastHintsForAnchor(fileSastHints, startLine, endLine);
    const sastRanges = buildSastRanges(sastHintsForAnchor, startLine, endLine);

    const calleeAnchors = collectCalleeAnchors({
      file,
      anchor,
      anchorBySymbol,
      symbolByAnchorKey
    });
    const calleeRanges: ChunkRange[] = [];
    for (const callee of calleeAnchors) {
      const calleeStart = Math.max(1, callee.startLine);
      const calleeEnd = Math.min(file.lines.length, callee.endLine);
      if (calleeEnd < calleeStart) continue;
      const ranges = buildChunkRanges(calleeStart, calleeEnd);
      for (const range of ranges) {
        calleeRanges.push(range);
        if (calleeRanges.length >= MAX_CALLEE_RANGES_PER_ANCHOR) {
          break;
        }
      }
      if (calleeRanges.length >= MAX_CALLEE_RANGES_PER_ANCHOR) {
        break;
      }
    }

    const rangeMap = new Map<string, { key: string; range: ChunkRange; priority: number }>();
    const addRange = (range: ChunkRange, priority: number) => {
      const key = rangeKey(range);
      const existing = rangeMap.get(key);
      if (!existing || priority > existing.priority) {
        rangeMap.set(key, { key, range, priority });
      }
    };
    for (const range of baseRanges) {
      addRange(range, 2);
    }
    for (const range of sinkRanges) {
      addRange(range, 1);
    }
    for (const range of calleeRanges) {
      addRange(range, 1);
    }
    for (const range of sastRanges) {
      addRange(range, 3);
    }

    const maxChunks = Math.max(1, MAX_CHUNKS_PER_ANCHOR);
    const sorted = Array.from(rangeMap.values()).sort(
      (a, b) => b.priority - a.priority || a.range.startLine - b.range.startLine
    );
    const selected: ChunkRange[] = [];
    const selectedKeys = new Set<string>();
    for (const range of baseRanges) {
      const key = rangeKey(range);
      const entry = rangeMap.get(key);
      if (!entry || selectedKeys.has(entry.key)) continue;
      selected.push(entry.range);
      selectedKeys.add(entry.key);
    }
    for (const entry of sorted) {
      if (selected.length >= maxChunks) {
        break;
      }
      if (selectedKeys.has(entry.key)) continue;
      selected.push(entry.range);
      selectedKeys.add(entry.key);
    }

    const overlapGroupId = crypto.randomUUID();
    for (const range of selected) {
      addChunkForRange({
        chunks: chunkDrafts,
        file,
        range,
        header,
        overlapGroupId,
        primarySymbol,
        repoPath,
        minChunkSize
      });
    }
  }

  if (chunkDrafts.length === 0) {
    const ranges = buildChunkRanges(1, file.lines.length);
    const overlapGroupId = crypto.randomUUID();
    const primarySymbol = file.filepath.split("/").pop() ?? file.filepath;
    const inputSources = collectInputSources(file.content);
    const { sinks: rawSinks } = collectSinks(file.lines, 1);
    const { sinks: sastSinks } = collectSastSinkHints(fileSastHints, 1, file.lines.length);
    const sinks = mergeUniqueStrings(rawSinks, sastSinks);
    const entryTypeHint = collectSastEntryTypeHint(fileSastHints, 1, file.lines.length);
    const reachability = options.reachabilityIndex?.getReachability({
      filepath: file.filepath,
      repoPath,
      startLine: 1,
      endLine: file.lines.length
    });
    const header = buildSecurityHeader({
      content: file.content,
      filepath: file.filepath,
      primarySymbol,
      sinks,
      inputSources,
      entryTypeHint,
      reachability
    });
    for (const range of ranges) {
      addChunkForRange({
        chunks: chunkDrafts,
        file,
        range,
        header,
        overlapGroupId,
        primarySymbol,
        repoPath,
        minChunkSize
      });
    }
  }

  return finalizeChunks(chunkDrafts, idPath);
}

function finalizeChunks(chunks: ChunkDraft[], idPath: string): Chunk[] {
  const sorted = [...chunks].sort(
    (a, b) => a.startLine - b.startLine || a.endLine - b.endLine
  );
  return sorted.map((chunk, index) => ({
    id: buildChunkId(idPath, chunk.startLine, chunk.endLine, chunk.contentHash),
    filepath: chunk.filepath,
    chunkIndex: index,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    content: chunk.content,
    contentHash: chunk.contentHash,
    chunkFormat: chunk.chunkFormat,
    securityHeader: chunk.securityHeader,
    primarySymbol: chunk.primarySymbol,
    entryPoint: chunk.entryPoint,
    executionRole: chunk.executionRole,
    sinks: chunk.sinks,
    overlapGroupId: chunk.overlapGroupId,
    dedupeKey: chunk.dedupeKey
  }));
}
