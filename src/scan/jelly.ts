import path from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { getToolsDir } from "./staticScanners.js";

type RunResult = {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
};

let jellyAvailablePromise: Promise<boolean> | null = null;

function findOnPath(command: string): string | null {
  const pathEnv = process.env.PATH || "";
  const parts = pathEnv.split(path.delimiter);
  const extList = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];

  for (const dir of parts) {
    for (const ext of extList) {
      const candidate = path.join(dir, `${command}${ext}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }
  return null;
}

function shouldUseShell(command: string): boolean {
  if (process.platform !== "win32") return false;
  return command.toLowerCase().endsWith(".cmd") || command.toLowerCase().endsWith(".bat");
}

function runCommand(
  command: string,
  args: string[],
  options?: { cwd?: string }
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const proc = spawn(command, args, {
      cwd: options?.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: shouldUseShell(command)
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => {
      reject(err);
    });
    proc.on("close", (code, signal) => {
      resolve({
        exitCode: code,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - start
      });
    });
  });
}

export function getJellyInstallDir(): string {
  return path.join(getToolsDir(), "jelly");
}

export function getJellyManagedPath(): string {
  const binDir = path.join(getJellyInstallDir(), "node_modules", ".bin");
  const ext = process.platform === "win32" ? ".cmd" : "";
  return path.join(binDir, `jelly${ext}`);
}

export function resolveJellyPath(): string | null {
  const candidates: string[] = [getJellyManagedPath()];
  const onPath = findOnPath("jelly");
  if (onPath) candidates.push(onPath);

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function isJellyAvailable(): Promise<boolean> {
  if (jellyAvailablePromise) {
    return jellyAvailablePromise;
  }
  const jellyPath = resolveJellyPath();
  if (!jellyPath) {
    jellyAvailablePromise = Promise.resolve(false);
    return jellyAvailablePromise;
  }
  jellyAvailablePromise = runCommand(jellyPath, ["--version"])
    .then((res) => res.exitCode === 0)
    .catch(() => false);
  return jellyAvailablePromise;
}

export async function runJellyCallGraph(params: {
  repoRoot: string;
  scanRoot: string;
  outputPath: string;
  timeoutSeconds?: number;
}): Promise<RunResult> {
  const jellyPath = resolveJellyPath();
  if (!jellyPath) {
    throw new Error("jelly not found on PATH or in ~/.hadrix/tools.");
  }
  const args = [
    "--callgraph-json",
    params.outputPath,
    "--ignore-dependencies",
    "--no-print-progress",
    "--no-tty",
    "--basedir",
    params.repoRoot
  ];
  if (params.timeoutSeconds && Number.isFinite(params.timeoutSeconds)) {
    args.push("--timeout", String(Math.max(1, Math.trunc(params.timeoutSeconds))));
  }
  args.push(params.scanRoot);
  return runCommand(jellyPath, args, { cwd: params.repoRoot });
}
