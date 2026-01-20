import path from "node:path";
import { readFileSync, statSync } from "node:fs";
import fg from "fast-glob";
import ignore from "ignore";

interface DiscoverOptions {
  root: string;
  includeExtensions: string[];
  exclude: string[];
  maxFileSizeBytes: number;
}

function loadGitignore(root: string): string[] {
  const gitignorePath = path.join(root, ".gitignore");
  try {
    const raw = readFileSync(gitignorePath, "utf-8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch {
    return [];
  }
}

function isTextFile(buffer: Buffer): boolean {
  const sample = buffer.slice(0, 4000);
  return !sample.includes(0);
}

export async function discoverFiles(options: DiscoverOptions): Promise<string[]> {
  const ig = ignore();
  ig.add(options.exclude);
  ig.add(loadGitignore(options.root));

  const entries = await fg(["**/*"], {
    cwd: options.root,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    absolute: true
  });

  const filtered: string[] = [];
  for (const file of entries) {
    const rel = path.relative(options.root, file);
    if (ig.ignores(rel)) continue;
    const ext = path.extname(file).toLowerCase();
    if (options.includeExtensions.length && !options.includeExtensions.includes(ext)) continue;

    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    if (stat.size > options.maxFileSizeBytes) continue;

    try {
      const buffer = readFileSync(file);
      if (!isTextFile(buffer)) continue;
    } catch {
      continue;
    }

    filtered.push(file);
  }

  return filtered;
}
