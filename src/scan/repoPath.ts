import path from "node:path";
import { readFileSync } from "node:fs";
import fg from "fast-glob";

const INFER_CODE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const INFER_ROOT_CONFIG_FILENAMES = [
  "package.json",
  "tsconfig.json",
  "jsconfig.json",
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "vite.config.js",
  "vite.config.ts",
  "vite.config.mjs",
  "nuxt.config.js",
  "nuxt.config.ts",
  "svelte.config.js",
  "svelte.config.ts",
  "astro.config.js",
  "astro.config.ts",
  "astro.config.mjs",
  "remix.config.js",
  "remix.config.ts",
  "turbo.json",
  "nx.json",
  "lerna.json",
  "rush.json"
];
const INFER_MONOREPO_ROOT_FILENAMES = new Set([
  "turbo.json",
  "nx.json",
  "lerna.json",
  "rush.json",
  "pnpm-workspace.yaml",
  "pnpm-workspace.yml"
]);
const INFER_SOURCE_PATH_HINTS = ["/src/", "/app/", "/pages/", "/server/", "/api/"];
const INFER_GENERIC_TOP_LEVEL_FOLDERS = new Set([
  "apps",
  "packages",
  "services",
  "libs",
  "lib",
  "projects",
  "components",
  "examples",
  "samples"
]);

type RepoPathStats = {
  prefix: string;
  total: number;
  code: number;
  config: number;
  sourceHints: number;
};

function normalizePath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .trim()
    .replace(/^\.?\/*/, "")
    .replace(/\/+$/, "");
}

export function normalizeRepoPath(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "";
  return normalizePath(value);
}

function shouldSkipInferencePath(pathname: string): boolean {
  const lowered = `/${pathname.toLowerCase()}/`;
  if (
    lowered.includes("/node_modules/") ||
    lowered.includes("/dist/") ||
    lowered.includes("/build/") ||
    lowered.includes("/out/") ||
    lowered.includes("/.git/") ||
    lowered.includes("/.hadrix/") ||
    lowered.includes("/.next/") ||
    lowered.includes("/coverage/")
  ) {
    return true;
  }
  const basename = lowered.split("/").filter(Boolean).pop() ?? "";
  if (basename.startsWith(".")) {
    return true;
  }
  return false;
}

function extensionOfPath(pathname: string): string {
  const idx = pathname.lastIndexOf(".");
  if (idx === -1) return "";
  return pathname.slice(idx).toLowerCase();
}

function isCodeFilepath(pathname: string): boolean {
  const ext = extensionOfPath(pathname.toLowerCase());
  return INFER_CODE_EXTENSIONS.has(ext);
}

function hasSourceHint(filepath: string, prefix: string): boolean {
  if (!prefix) return false;
  const rel = filepath.startsWith(`${prefix}/`) ? filepath.slice(prefix.length) : filepath;
  const lower = rel.toLowerCase();
  return INFER_SOURCE_PATH_HINTS.some((hint) => lower.includes(hint));
}

function buildRepoPathStats(
  filepaths: string[],
  prefixes: string[],
  configHits: Map<string, number>
): RepoPathStats[] {
  const statsByPrefix = new Map<string, RepoPathStats>();
  for (const prefix of prefixes) {
    statsByPrefix.set(prefix, {
      prefix,
      total: 0,
      code: 0,
      config: configHits.get(prefix) ?? 0,
      sourceHints: 0
    });
  }

  for (const filepath of filepaths) {
    for (const prefix of prefixes) {
      if (!filepath.startsWith(`${prefix}/`)) {
        continue;
      }
      const stats = statsByPrefix.get(prefix);
      if (!stats) continue;
      stats.total += 1;
      if (isCodeFilepath(filepath)) {
        stats.code += 1;
      }
      if (hasSourceHint(filepath, prefix)) {
        stats.sourceHints += 1;
      }
    }
  }

  return Array.from(statsByPrefix.values());
}

function scoreRepoPathCandidate(stats: RepoPathStats): number {
  const sourceBonus = Math.min(stats.sourceHints, 20) * 2;
  return stats.code * 2 + stats.total + stats.config * 25 + sourceBonus;
}

function commonPathPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  let prefix = paths[0].split("/").filter(Boolean);
  for (let i = 1; i < paths.length; i += 1) {
    const parts = paths[i].split("/").filter(Boolean);
    let j = 0;
    while (j < prefix.length && j < parts.length && prefix[j] === parts[j]) {
      j += 1;
    }
    prefix = prefix.slice(0, j);
    if (prefix.length === 0) break;
  }
  return prefix.join("/");
}

function isGenericContainerPath(prefix: string): boolean {
  const normalized = normalizePath(prefix);
  if (!normalized || normalized.includes("/")) {
    return false;
  }
  return INFER_GENERIC_TOP_LEVEL_FOLDERS.has(normalized.toLowerCase());
}

function inferRepoPathFromConfigFiles(
  filepaths: string[],
  options?: { monorepoRoot?: boolean }
): string {
  const candidates = new Map<string, number>();
  let hasRootConfig = false;

  for (const filepath of filepaths) {
    const normalized = normalizePath(filepath);
    const lower = normalized.toLowerCase();
    for (const name of INFER_ROOT_CONFIG_FILENAMES) {
      if (lower === name || lower.endsWith(`/${name}`)) {
        const prefix = lower === name ? "" : normalized.slice(0, normalized.length - name.length - 1);
        if (!prefix) {
          hasRootConfig = true;
          continue;
        }
        candidates.set(prefix, (candidates.get(prefix) ?? 0) + 1);
      }
    }
  }

  if (candidates.size === 0) {
    return "";
  }

  if (candidates.size === 1 && !hasRootConfig) {
    return Array.from(candidates.keys())[0];
  }

  const prefixes = Array.from(candidates.keys());
  const stats = buildRepoPathStats(filepaths, prefixes, candidates);
  if (stats.length === 0) {
    return "";
  }

  const totalCode = stats.reduce((sum, item) => sum + item.code, 0);
  const scored = stats
    .map((item) => ({
      ...item,
      score: scoreRepoPathCandidate(item),
      codeShare: totalCode > 0 ? item.code / totalCode : item.total / filepaths.length
    }))
    .sort((a, b) => b.score - a.score || b.code - a.code || b.total - a.total);

  const best = scored[0];
  const second = scored[1];
  if (!best) {
    return "";
  }

  const monorepoRoot = options?.monorepoRoot ?? false;
  const leadMultiplier = monorepoRoot ? (hasRootConfig ? 1.25 : 1.15) : hasRootConfig ? 1.4 : 1.2;
  const scoreLead = !second || best.score >= second.score * leadMultiplier;
  const minShare = monorepoRoot ? (hasRootConfig ? 0.55 : 0.5) : hasRootConfig ? 0.7 : 0.55;
  if (scoreLead && best.codeShare >= minShare && best.code >= 5) {
    return best.prefix;
  }
  if (scoreLead && best.config >= 2 && best.code >= 10) {
    return best.prefix;
  }
  const strongAppCandidate =
    best.config >= 1 && best.sourceHints >= 2 && best.code >= 8 && best.total >= 12;
  if (monorepoRoot && strongAppCandidate) {
    const scoreRatio = second && second.score > 0 ? best.score / second.score : Infinity;
    const codeRatio = second && second.code > 0 ? best.code / second.code : Infinity;
    if (scoreRatio >= 1.1 || codeRatio >= 1.3) {
      return best.prefix;
    }
  }

  return "";
}

function inferRepoPathFromDominantFolder(
  filepaths: string[],
  options?: { monorepoRoot?: boolean }
): string {
  const statsByFolder = new Map<string, { total: number; code: number }>();
  let totalCode = 0;

  for (const filepath of filepaths) {
    const parts = filepath.split("/").filter(Boolean);
    if (parts.length < 2) {
      continue;
    }
    const folder = parts[0];
    const stats = statsByFolder.get(folder) ?? { total: 0, code: 0 };
    stats.total += 1;
    if (isCodeFilepath(filepath)) {
      stats.code += 1;
      totalCode += 1;
    }
    statsByFolder.set(folder, stats);
  }

  if (statsByFolder.size === 0) {
    return "";
  }
  if (statsByFolder.size === 1) {
    return Array.from(statsByFolder.keys())[0];
  }

  const sorted = Array.from(statsByFolder.entries())
    .map(([prefix, stats]) => ({ prefix, ...stats }))
    .sort((a, b) => b.code - a.code || b.total - a.total);

  const best = sorted[0];
  const second = sorted[1];
  if (!best || best.code === 0) {
    return "";
  }

  const monorepoRoot = options?.monorepoRoot ?? false;
  const share = totalCode > 0 ? best.code / totalCode : best.total / filepaths.length;
  const ratio = second && second.code > 0 ? best.code / second.code : Infinity;
  const minShare = monorepoRoot ? 0.55 : 0.7;
  const minRatio = monorepoRoot ? 1.3 : 1.5;
  if (share >= minShare && ratio >= minRatio) {
    return best.prefix;
  }
  if (share >= (monorepoRoot ? 0.65 : 0.8)) {
    return best.prefix;
  }

  return "";
}

async function detectMonorepoRootFromDisk(repoRoot: string, filepaths: string[]): Promise<boolean> {
  const normalizedPaths = new Set(filepaths.map((path) => normalizePath(path)));
  for (const indicator of INFER_MONOREPO_ROOT_FILENAMES) {
    if (normalizedPaths.has(indicator)) {
      return true;
    }
  }

  const hasRootPackage = normalizedPaths.has("package.json");
  const packageJsonCount = filepaths.filter((filepath) => {
    const normalized = normalizePath(filepath);
    return normalized.endsWith("/package.json") && normalized !== "package.json";
  }).length;

  const hasContainerDir = filepaths.some((filepath) => {
    const top = normalizePath(filepath).split("/").filter(Boolean)[0] ?? "";
    return INFER_GENERIC_TOP_LEVEL_FOLDERS.has(top.toLowerCase());
  });

  if (packageJsonCount >= 2 && (hasContainerDir || hasRootPackage)) {
    return true;
  }

  if (hasRootPackage) {
    try {
      const rootPackagePath = path.join(repoRoot, "package.json");
      const content = readFileSync(rootPackagePath, "utf-8");
      if (content.includes("\"workspaces\"") || content.includes("'workspaces'")) {
        return true;
      }
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === "object") {
        if (parsed.workspaces) return true;
        if (parsed.turbo) return true;
        if (parsed.nx) return true;
        if (parsed.pnpm) return true;
        if (parsed.lerna) return true;
      }
    } catch {
      // ignore parse errors; treat as non-monorepo
    }
  }

  if (hasRootPackage && packageJsonCount >= 1 && hasContainerDir) {
    return true;
  }

  return false;
}

async function collectInferenceFilepaths(repoRoot: string): Promise<string[]> {
  const entries = await fg(["**/*"], {
    cwd: repoRoot,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false
  });
  return entries
    .map((entry) => normalizePath(entry))
    .filter(Boolean)
    .filter((filepath) => !shouldSkipInferencePath(filepath));
}

export async function inferRepoPathFromDisk(repoRoot: string): Promise<string | null> {
  const allPaths = await collectInferenceFilepaths(repoRoot);
  if (allPaths.length === 0) {
    return null;
  }

  const monorepoRoot = await detectMonorepoRootFromDisk(repoRoot, allPaths);
  const nested = allPaths.filter((filepath) => filepath.includes("/"));
  if (nested.length === 0) {
    return null;
  }

  const prefix = commonPathPrefix(nested);
  let prefixFallback = "";
  if (prefix) {
    const covered = allPaths.filter((path) => path.startsWith(`${prefix}/`)).length;
    const coverage = covered / allPaths.length;
    if (coverage >= 0.6) {
      prefixFallback = prefix;
      if (!isGenericContainerPath(prefix)) {
        return prefix;
      }
    }
  }

  const inferredFromConfig = inferRepoPathFromConfigFiles(allPaths, { monorepoRoot });
  if (inferredFromConfig) {
    return inferredFromConfig;
  }

  const inferredFromDominantFolder = inferRepoPathFromDominantFolder(allPaths, { monorepoRoot });
  if (inferredFromDominantFolder) {
    return inferredFromDominantFolder;
  }

  return prefixFallback || null;
}
