import path from "node:path";
import { mkdirSync, renameSync, chmodSync, existsSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { spawn, spawnSync } from "node:child_process";
import { getToolsDir, resolveToolPath } from "../scan/staticScanners.js";
import { getJellyInstallDir, resolveJellyPath } from "../scan/jelly.js";
import { promptYesNo as promptYesNoPrompt } from "../ui/prompts.js";

const require = createRequire(import.meta.url);
const tar = require("tar") as typeof import("tar");
const AdmZip = require("adm-zip") as typeof import("adm-zip");

const VERSIONS = {
  gitleaks: "8.18.1",
  osvScanner: "1.9.2",
  semgrep: "1.83.0",
  jelly: "0.12.0"
};

interface SetupOptions {
  autoYes?: boolean;
  logger?: (message: string) => void;
}

interface InstallResult {
  tool: string;
  installed: boolean;
  path?: string;
  optional?: boolean;
}

function log(logger: ((message: string) => void) | undefined, message: string) {
  logger?.(message);
}

function isEslintAvailable(): boolean {
  try {
    require.resolve("eslint");
    require.resolve("eslint-plugin-security");
    require.resolve("@typescript-eslint/parser");
    require.resolve("@typescript-eslint/eslint-plugin");
    return true;
  } catch {
    return false;
  }
}

function isHadrixRepo(cwd: string): boolean {
  try {
    const raw = readFileSync(path.join(cwd, "package.json"), "utf-8");
    const pkg = JSON.parse(raw) as { name?: string };
    return pkg?.name === "hadrix";
  } catch {
    return false;
  }
}

async function installEslintDeps(logger?: (message: string) => void): Promise<InstallResult> {
  if (isEslintAvailable()) {
    log(logger, "eslint already available (node_modules).");
    return { tool: "eslint", installed: true, path: "node_modules" };
  }

  const cwd = process.cwd();
  if (!isHadrixRepo(cwd)) {
    throw new Error(
      "eslint dependencies missing. Run setup from the Hadrix CLI repo or reinstall the CLI."
    );
  }

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("npm", ["install", "--no-fund", "--no-audit"], { stdio: "inherit", cwd });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`npm exited ${code}`))));
  });

  if (!isEslintAvailable()) {
    throw new Error("eslint dependencies still missing after npm install.");
  }

  return { tool: "eslint", installed: true, path: "node_modules" };
}

function getPlatformKey(): string {
  if (process.platform === "darwin") return "darwin";
  if (process.platform === "linux") return "linux";
  if (process.platform === "win32") return "windows";
  return process.platform;
}

function getArchAliases(): string[] {
  if (process.arch === "x64") return ["x64", "amd64"];
  if (process.arch === "arm64") return ["arm64", "aarch64"];
  return [process.arch];
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": "hadrix-setup" }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status}`);
  }
  return await res.json();
}

async function downloadToFileNode(url: string, dest: string) {
  const res = await fetch(url, { headers: { "User-Agent": "hadrix-setup" } });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  const { writeFile } = await import("node:fs/promises");
  await writeFile(dest, buffer);
}

async function resolveGithubAsset(repo: string, version: string, platformKey: string, archAliases: string[]): Promise<{ name: string; url: string }> {
  const release = await fetchJson(`https://api.github.com/repos/${repo}/releases/tags/v${version}`);
  const assets = Array.isArray(release?.assets) ? release.assets : [];

  const match = assets.find((asset: any) => {
    const name = String(asset?.name || "").toLowerCase();
    const isAllowed =
      name.endsWith(".tar.gz") ||
      name.endsWith(".tgz") ||
      name.endsWith(".zip") ||
      name.endsWith(".exe") ||
      !name.includes(".");
    if (!isAllowed) return false;
    if (!name.includes(platformKey)) return false;
    return archAliases.some((arch) => name.includes(arch));
  });

  if (!match?.browser_download_url) {
    throw new Error(`No matching ${repo} asset found for ${platformKey}/${archAliases.join(",")}`);
  }

  return { name: match.name, url: match.browser_download_url };
}

function ensureBinDir(): string {
  const binDir = path.join(getToolsDir(), "bin");
  mkdirSync(binDir, { recursive: true });
  return binDir;
}

async function installGitleaks(logger?: (message: string) => void): Promise<InstallResult> {
  const platform = getPlatformKey();
  const archAliases = getArchAliases();
  const asset = await resolveGithubAsset("gitleaks/gitleaks", VERSIONS.gitleaks, platform, archAliases);
  const binDir = ensureBinDir();
  const tmpPath = path.join(tmpdir(), asset.name);
  await downloadToFileNode(asset.url, tmpPath);

  if (asset.name.endsWith(".tar.gz") || asset.name.endsWith(".tgz")) {
    await tar.x({ file: tmpPath, cwd: binDir });
  } else if (asset.name.endsWith(".zip")) {
    const zip = new AdmZip(tmpPath);
    zip.extractAllTo(binDir, true);
  } else {
    const target = path.join(binDir, process.platform === "win32" ? "gitleaks.exe" : "gitleaks");
    renameSync(tmpPath, target);
  }

  const target = resolveToolPath("gitleaks", null) ?? getManagedBinPath("gitleaks");
  if (existsSync(target)) {
    chmodSync(target, 0o755);
  }

  log(logger, `Installed gitleaks to ${target}`);
  rmSync(tmpPath, { force: true });
  return { tool: "gitleaks", installed: true, path: target };
}

async function installOsvScanner(logger?: (message: string) => void): Promise<InstallResult> {
  const platform = getPlatformKey();
  const archAliases = getArchAliases();
  const asset = await resolveGithubAsset("google/osv-scanner", VERSIONS.osvScanner, platform, archAliases);
  const binDir = ensureBinDir();
  const tmpPath = path.join(tmpdir(), asset.name);
  await downloadToFileNode(asset.url, tmpPath);

  let target = path.join(binDir, process.platform === "win32" ? "osv-scanner.exe" : "osv-scanner");
  renameSync(tmpPath, target);
  chmodSync(target, 0o755);
  log(logger, `Installed osv-scanner to ${target}`);
  return { tool: "osv-scanner", installed: true, path: target };
}

function getManagedBinPath(name: string): string {
  const binDir = path.join(getToolsDir(), "bin");
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(binDir, `${name}${ext}`);
}

function findPython(): string | null {
  const candidates = ["python3", "python"];
  for (const name of candidates) {
    const result = spawnSync(name, ["--version"], { stdio: "ignore" });
    if (!result.error) return name;
  }
  return null;
}

async function installSemgrep(logger?: (message: string) => void): Promise<InstallResult> {
  const python = findPython();
  if (!python) {
    throw new Error("Python not found. Install Python 3 to install semgrep.");
  }
  const semgrepDir = path.join(getToolsDir(), "semgrep");
  mkdirSync(semgrepDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(python, ["-m", "venv", semgrepDir], { stdio: "inherit" });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`venv exited ${code}`))));
  });

  const pipPath = process.platform === "win32"
    ? path.join(semgrepDir, "Scripts", "pip.exe")
    : path.join(semgrepDir, "bin", "pip");
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(pipPath, ["install", `semgrep==${VERSIONS.semgrep}`], { stdio: "inherit" });
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`pip exited ${code}`))));
  });

  const semgrepPath = resolveToolPath("semgrep", null) ?? path.join(semgrepDir, process.platform === "win32" ? "Scripts/semgrep.exe" : "bin/semgrep");
  log(logger, `Installed semgrep to ${semgrepPath}`);
  return { tool: "semgrep", installed: true, path: semgrepPath };
}

async function installJelly(logger?: (message: string) => void): Promise<InstallResult> {
  const jellyDir = getJellyInstallDir();
  mkdirSync(jellyDir, { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      "npm",
      ["install", "--no-fund", "--no-audit", "--no-save", `@cs-au-dk/jelly@${VERSIONS.jelly}`],
      { stdio: "inherit", cwd: jellyDir }
    );
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`npm exited ${code}`))));
  });

  const jellyPath = resolveJellyPath();
  if (!jellyPath) {
    throw new Error("jelly install failed; binary not found.");
  }
  log(logger, `Installed jelly to ${jellyPath}`);
  return { tool: "jelly", installed: true, path: jellyPath };
}

async function promptYesNo(question: string, autoYes: boolean): Promise<boolean> {
  if (autoYes) return true;
  return await promptYesNoPrompt(question, { defaultYes: true });
}

export async function runSetup(options: SetupOptions = {}): Promise<InstallResult[]> {
  const logger = options.logger ?? (() => {});
  const autoYes = options.autoYes ?? false;
  const results: InstallResult[] = [];

  log(logger, "Hadrix setup: installing required scanners and jelly call graph analyzer.");

  if (!isEslintAvailable()) {
    const ok = await promptYesNo("Install eslint scanner dependencies (npm)?", autoYes);
    if (!ok) {
      results.push({ tool: "eslint", installed: false });
    } else {
      try {
        const result = await installEslintDeps(logger);
        results.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(logger, `Failed to install eslint dependencies: ${message}`);
        results.push({ tool: "eslint", installed: false });
      }
    }
  } else {
    results.push({ tool: "eslint", installed: true, path: "node_modules" });
  }

  const tools: Array<{
    name: "semgrep" | "gitleaks" | "osv-scanner";
    install: () => Promise<InstallResult>;
  }> = [
    { name: "semgrep", install: () => installSemgrep(logger) },
    { name: "gitleaks", install: () => installGitleaks(logger) },
    { name: "osv-scanner", install: () => installOsvScanner(logger) }
  ];

  for (const tool of tools) {
    const existing = resolveToolPath(tool.name, null);
    if (existing) {
      log(logger, `${tool.name} already installed at ${existing}`);
      results.push({ tool: tool.name, installed: true, path: existing });
      continue;
    }

    const ok = await promptYesNo(`Install ${tool.name}?`, autoYes);
    if (!ok) {
      results.push({ tool: tool.name, installed: false });
      continue;
    }

    try {
      const result = await tool.install();
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(logger, `Failed to install ${tool.name}: ${message}`);
      results.push({ tool: tool.name, installed: false });
    }
  }

  const existingJelly = resolveJellyPath();
  if (existingJelly) {
    log(logger, `jelly already available at ${existingJelly}`);
    results.push({ tool: "jelly", installed: true, path: existingJelly });
  } else {
    const ok = await promptYesNo("Install jelly call graph analyzer?", autoYes);
    if (!ok) {
      results.push({ tool: "jelly", installed: false });
    } else {
      try {
        const result = await installJelly(logger);
        results.push(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(logger, `Failed to install jelly: ${message}`);
        results.push({ tool: "jelly", installed: false });
      }
    }
  }

  return results;
}
