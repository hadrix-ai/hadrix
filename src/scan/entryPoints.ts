import path from "node:path";
import { readFile } from "node:fs/promises";

const SOURCE_EXT_PATTERN = /\.(ts|tsx|js|jsx)$/i;
const NEXT_APP_ROUTE_PATTERN = /(?:^|\/)app\/(?:.+\/)?route\.(ts|tsx|js|jsx)$/i;
const NEXT_PAGES_API_PATTERN = /(?:^|\/)pages\/api\/.+\.(ts|tsx|js|jsx)$/i;
const NEXT_MIDDLEWARE_PATTERN = /(?:^|\/)middleware\.(ts|tsx|js|jsx)$/i;
const SUPABASE_EDGE_PATTERN =
  /(?:^|\/)supabase\/functions\/([^/]+)(?:\/index)?\.(ts|tsx|js|jsx)$/i;

const NEXT_HTTP_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"];

export type EntryPointCandidate = {
  label: string;
  filepath: string;
  startLine: number;
  endLine?: number | null;
};

function normalizePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .trim()
    .replace(/^\.?\/*/, "")
    .replace(/\/+/g, "/");
}

function stripExtension(value: string): string {
  return value.replace(/\.[^/.]+$/, "");
}

function sliceAfterSegment(value: string, segment: string): string | null {
  const normalized = normalizePath(value);
  if (normalized.startsWith(`${segment}/`)) {
    return normalized.slice(segment.length + 1);
  }
  const marker = `/${segment}/`;
  const idx = normalized.indexOf(marker);
  if (idx === -1) return null;
  return normalized.slice(idx + marker.length);
}

function toRoutePath(value: string): string {
  const normalized = normalizePath(value).replace(/^\/+/, "").replace(/\/+$/, "");
  if (!normalized) return "/";
  return `/${normalized}`;
}

async function readLines(filePath: string): Promise<string[]> {
  try {
    const content = await readFile(filePath, "utf-8");
    return content.split("\n");
  } catch {
    return [];
  }
}

function findMethodLines(lines: string[]): Array<{ method: string; line: number }> {
  const results: Array<{ method: string; line: number }> = [];
  const methodGroup = NEXT_HTTP_METHODS.join("|");
  const funcPattern = new RegExp(`\\bexport\\s+(?:async\\s+)?function\\s+(${methodGroup})\\b`);
  const constPattern = new RegExp(`\\bexport\\s+(?:const|let|var)\\s+(${methodGroup})\\b`);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    let match = line.match(funcPattern);
    if (!match) {
      match = line.match(constPattern);
    }
    if (match?.[1]) {
      results.push({ method: match[1].toUpperCase(), line: i + 1 });
    }
  }
  return results;
}

function findFirstLine(lines: string[], patterns: RegExp[]): number | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        return i + 1;
      }
    }
  }
  return null;
}

function formatNextAppLabel(routePath: string, method?: string): string {
  if (method) {
    return `nextjs:app:${method} ${routePath}`;
  }
  return `nextjs:app:${routePath}`;
}

function formatNextPagesLabel(routePath: string): string {
  return `nextjs:pages:${routePath}`;
}

function formatNextMiddlewareLabel(): string {
  return "nextjs:middleware";
}

function formatSupabaseEdgeLabel(name: string): string {
  return `supabase:edge:${name}`;
}

export async function discoverEntryPoints(params: {
  repoRoot: string;
  files: string[];
}): Promise<EntryPointCandidate[]> {
  const results: EntryPointCandidate[] = [];
  const seen = new Set<string>();

  for (const file of params.files) {
    const relPath = normalizePath(path.relative(params.repoRoot, file));
    if (!relPath || !SOURCE_EXT_PATTERN.test(relPath)) continue;

    if (NEXT_MIDDLEWARE_PATTERN.test(relPath)) {
      const label = formatNextMiddlewareLabel();
      const key = `${label}|${relPath}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({ label, filepath: relPath, startLine: 1, endLine: null });
      }
      continue;
    }

    if (NEXT_APP_ROUTE_PATTERN.test(relPath)) {
      const appPath = sliceAfterSegment(relPath, "app");
      const routeFile = appPath ? stripExtension(appPath) : "";
      const routeBase = routeFile.replace(/(?:^|\/)route$/i, "");
      const routePath = toRoutePath(routeBase);
      const lines = await readLines(file);
      const methods = findMethodLines(lines);
      if (methods.length > 0) {
        for (const method of methods) {
          const label = formatNextAppLabel(routePath, method.method);
          const key = `${label}|${relPath}|${method.line}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({
            label,
            filepath: relPath,
            startLine: method.line,
            endLine: null
          });
        }
      } else {
        const label = formatNextAppLabel(routePath);
        const key = `${label}|${relPath}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({ label, filepath: relPath, startLine: 1, endLine: null });
        }
      }
      continue;
    }

    if (NEXT_PAGES_API_PATTERN.test(relPath)) {
      const pagesPath = sliceAfterSegment(relPath, "pages/api");
      const routeBase = pagesPath
        ? stripExtension(pagesPath).replace(/(?:^|\/)index$/i, "")
        : "";
      const routePath = toRoutePath(routeBase ? `api/${routeBase}` : "api");
      const lines = await readLines(file);
      const line = findFirstLine(lines, [
        /\bexport\s+default\b/,
        /\bmodule\.exports\b/,
        /\bexports\./
      ]);
      const label = formatNextPagesLabel(routePath);
      const key = `${label}|${relPath}|${line ?? 1}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          label,
          filepath: relPath,
          startLine: line ?? 1,
          endLine: null
        });
      }
      continue;
    }

    const supabaseMatch = relPath.match(SUPABASE_EDGE_PATTERN);
    if (supabaseMatch?.[1]) {
      const name = supabaseMatch[1];
      const label = formatSupabaseEdgeLabel(name);
      const lines = await readLines(file);
      const line = findFirstLine(lines, [/\bDeno\.serve\s*\(/, /\bserve\s*\(/]);
      const key = `${label}|${relPath}|${line ?? 1}`;
      if (!seen.has(key)) {
        seen.add(key);
        results.push({
          label,
          filepath: relPath,
          startLine: line ?? 1,
          endLine: null
        });
      }
    }
  }

  return results;
}
