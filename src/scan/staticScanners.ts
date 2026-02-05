import path from "node:path";
import os from "node:os";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawn } from "node:child_process";
import fg from "fast-glob";
import { readEnv, readEnvRaw } from "../config/env.js";
import type { HadrixConfig } from "../config/loadConfig.js";
import type { Logger } from "../logging/logger.js";
import type { StaticFinding, Severity } from "../types.js";

interface ToolPaths {
  gitleaks: string;
  osvScanner: string;
}

const ESLINT_FLAT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.cjs",
  "eslint.config.mjs",
  "eslint.config.ts"
];
const ESLINT_LEGACY_CONFIG_FILES = [
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml"
];


export function getToolsDir(): string {
  // Allow explicit override (useful in CI, containers, and sudo scenarios).
  const override = readEnv("HADRIX_TOOLS_DIR");
  if (override) return override;
  return path.join(os.homedir(), ".hadrix", "tools");
}

function lookupHomeDir(username: string): string | null {
  const target = username.trim();
  if (!target) return null;
  try {
    const passwd = readFileSync("/etc/passwd", "utf-8");
    for (const line of passwd.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const parts = line.split(":");
      if (parts.length < 6) continue;
      if (parts[0] !== target) continue;
      const home = parts[5] ?? "";
      return home.trim() || null;
    }
  } catch {
    // ignore
  }
  return null;
}

function getToolsDirCandidates(): string[] {
  const candidates: string[] = [];
  const primary = getToolsDir();
  if (primary) candidates.push(primary);

  // If running under sudo, also consider the invoking user's home directory.
  const sudoUser = readEnv("SUDO_USER");
  if (sudoUser) {
    const sudoHome = lookupHomeDir(sudoUser);
    if (sudoHome) candidates.push(path.join(sudoHome, ".hadrix", "tools"));
  }

  // If HOME is set and differs from os.homedir(), consider it too.
  const envHome = readEnv("HOME");
  if (envHome) candidates.push(path.join(envHome, ".hadrix", "tools"));

  // De-dupe while preserving order.
  const seen = new Set<string>();
  return candidates.filter((dir) => {
    const key = dir.trim();
    if (!key) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function findHomeInstalledTool(tool: "gitleaks" | "osv-scanner"): string[] {
  // Best-effort: if the scanner is installed for some other user under /home/*/.hadrix/tools,
  // try to find it. This helps when the CLI is run under sudo/systemd but the tools were
  // installed as a regular user.
  const results: string[] = [];
  const homeRoot = process.platform === "win32" ? null : "/home";
  if (!homeRoot) return results;

  let entries: string[] = [];
  try {
    entries = readdirSync(homeRoot);
  } catch {
    return results;
  }

  for (const entry of entries) {
    const userHome = path.join(homeRoot, entry);
    let stats;
    try {
      stats = statSync(userHome);
    } catch {
      continue;
    }
    if (!stats.isDirectory()) continue;

    const toolsDir = path.join(userHome, ".hadrix", "tools");
    const candidate = getManagedBinPath(tool, toolsDir);

    if (existsSync(candidate)) {
      results.push(candidate);
    }
  }

  return results;
}

function commonSystemToolPaths(tool: string): string[] {
  if (process.platform === "win32") return [];
  return [
    `/usr/local/bin/${tool}`,
    `/usr/bin/${tool}`,
    `/bin/${tool}`
  ];
}

function getManagedBinPath(name: string, toolsDir: string): string {
  const binDir = path.join(toolsDir, "bin");
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(binDir, `${name}${ext}`);
}

function isExecutable(filePath: string): boolean {
  return existsSync(filePath);
}

function findEslintConfig(scanRoot: string): { configPath: string | null; legacyDetected: boolean } {
  for (const name of ESLINT_FLAT_CONFIG_FILES) {
    const candidate = path.join(scanRoot, name);
    if (existsSync(candidate)) {
      return { configPath: candidate, legacyDetected: false };
    }
  }

  for (const name of ESLINT_LEGACY_CONFIG_FILES) {
    const candidate = path.join(scanRoot, name);
    if (existsSync(candidate)) {
      return { configPath: null, legacyDetected: true };
    }
  }

  try {
    const pkgRaw = readFileSync(path.join(scanRoot, "package.json"), "utf-8");
    const pkg = JSON.parse(pkgRaw) as { eslintConfig?: unknown };
    if (pkg?.eslintConfig) {
      return { configPath: null, legacyDetected: true };
    }
  } catch {
    // ignore
  }

  return { configPath: null, legacyDetected: false };
}

function findOnPath(command: string): string | null {
  const pathEnv = readEnvRaw("PATH") ?? "";
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

export function resolveToolPath(
  tool: "gitleaks" | "osv-scanner",
  override?: string | null
): string | null {
  const candidates: string[] = [];
  if (override) candidates.push(override);

  for (const toolsDir of getToolsDirCandidates()) {
    candidates.push(getManagedBinPath(tool, toolsDir));
  }

  // Common absolute install locations (helpful when PATH is minimal).
  candidates.push(...commonSystemToolPaths(tool));

  // Last resort: tools installed for a different user under /home/*/.hadrix/tools.
  candidates.push(...findHomeInstalledTool(tool));

  const onPath = findOnPath(tool);
  if (onPath) candidates.push(onPath);

  for (const candidate of candidates) {
    if (candidate && isExecutable(candidate)) return candidate;
  }

  return null;
}

export function resolveStaticScannersAvailable(config: HadrixConfig): {
  tools: Partial<ToolPaths>;
  missing: string[];
} {
  const gitleaks = resolveToolPath("gitleaks", config.staticScanners.gitleaks.path);
  const osvScanner = resolveToolPath("osv-scanner", config.staticScanners.osvScanner.path);

  const missing: string[] = [];
  if (!gitleaks) missing.push("gitleaks");
  if (!osvScanner) missing.push("osv-scanner");

  return {
    tools: { gitleaks, osvScanner },
    missing
  };
}

function mapSeverity(tool: StaticFinding["tool"], raw: string | number | undefined): Severity {
  if (tool === "eslint") {
    if (raw === 2) return "high";
    if (raw === 1) return "medium";
    return "info";
  }
  const value = (typeof raw === "string" ? raw : "").toLowerCase();
  if (tool === "osv-scanner") {
    if (value === "critical") return "critical";
    if (value === "high") return "high";
    if (value === "medium") return "medium";
    return "low";
  }
  return "high";
}

function severityRank(value: Severity): number {
  switch (value) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    case "info":
    default:
      return 0;
  }
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

async function spawnCapture(command: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  // If cwd is invalid, Node will surface it as a spawn ENOENT which is confusing.
  // Make it explicit.
  if (!cwd || !existsSync(cwd)) {
    throw new Error(`Scan root does not exist: ${cwd}`);
  }

  return await new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"], cwd });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function stripEslintPluginConfigs(plugin: any): any {
  if (!plugin || typeof plugin !== "object") return plugin;
  const copy = { ...plugin };
  if ("configs" in copy) {
    delete (copy as { configs?: unknown }).configs;
  }
  return copy;
}

async function runEslint(
  config: HadrixConfig,
  scanRoot: string,
  repoRoot: string,
  logger?: Logger
): Promise<StaticFinding[]> {
  if (!config.staticScanners.eslint.enabled) return [];

  const extensions = (config.staticScanners.eslint.extensions ?? [])
    .map((ext) => ext.trim())
    .filter(Boolean)
    .map((ext) => (ext.startsWith(".") ? ext : `.${ext}`));
  if (!extensions.length) return [];

  const ignorePatterns = (config.staticScanners.eslint.ignorePatterns ?? [])
    .map((pattern) => pattern.trim())
    .filter(Boolean);

  let ESLintCtor: any;
  let eslintPluginSecurity: any;
  let tsParser: any;
  let fixupPluginRules: ((plugin: any) => any) | null = null;
  try {
    const eslintModule = await import("eslint");
    ESLintCtor = await (eslintModule as any).loadESLint({ useFlatConfig: true, cwd: scanRoot });
    const securityModule = await import("eslint-plugin-security");
    eslintPluginSecurity = (securityModule as any).default ?? securityModule;
    const parserModule = await import("@typescript-eslint/parser");
    tsParser = (parserModule as any).default ?? parserModule;
    const compatModule = await import("@eslint/compat");
    fixupPluginRules = (compatModule as any).fixupPluginRules ?? (compatModule as any).default?.fixupPluginRules ?? null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `eslint scanner unavailable. Install dependencies (eslint, eslint-plugin-security, @typescript-eslint/parser, @typescript-eslint/eslint-plugin, @eslint/compat, path-type). ${message}`
    );
  }

  const securityPluginRaw = fixupPluginRules ? fixupPluginRules(eslintPluginSecurity) : eslintPluginSecurity;
  const securityPlugin = stripEslintPluginConfigs(securityPluginRaw);
  const recommendedRules = (eslintPluginSecurity as any).configs?.recommended?.rules ?? {};
  const { configPath, legacyDetected } = findEslintConfig(scanRoot);
  if (legacyDetected && !configPath) {
    logger?.warn(
      "[hadrix] Detected legacy ESLint config; ignoring it in favor of built-in security rules."
    );
  }

  const eslint = configPath
    ? new ESLintCtor({
        cwd: scanRoot,
        overrideConfigFile: configPath,
        errorOnUnmatchedPattern: false
      })
    : new ESLintCtor({
        cwd: scanRoot,
        overrideConfigFile: true,
        errorOnUnmatchedPattern: false,
        overrideConfig: [
          {
            files: extensions.map((ext) => `**/*${ext}`),
            ignores: ignorePatterns,
            languageOptions: {
              parser: tsParser,
              ecmaVersion: "latest",
              sourceType: "module",
              parserOptions: {
                ecmaFeatures: { jsx: true }
              }
            },
            plugins: {
              security: securityPlugin
            },
            rules: {
              ...recommendedRules
            }
          }
        ]
      });

  const filePatterns = extensions.map((ext) => `**/*${ext}`);
  const results = await eslint.lintFiles(filePatterns);
  const fileCache = new Map<string, string>();

  const readSnippet = (filePath: string, startLine: number, endLine: number): string | undefined => {
    if (startLine <= 0) return undefined;
    let content = fileCache.get(filePath);
    if (!content) {
      try {
        content = readFileSync(filePath, "utf-8");
        fileCache.set(filePath, content);
      } catch {
        return undefined;
      }
    }
    const lines = content.split("\n");
    const startIdx = Math.max(0, startLine - 1);
    const endIdx = Math.min(lines.length, endLine);
    return lines.slice(startIdx, endIdx).join("\n").slice(0, 400);
  };

  const findings: StaticFinding[] = [];
  for (const res of results) {
    const filePathRaw = res.filePath;
    if (!filePathRaw) continue;
    const absPath = path.isAbsolute(filePathRaw) ? filePathRaw : path.join(scanRoot, filePathRaw);
    const filepath = path.relative(repoRoot, absPath);

    for (const msg of res.messages) {
      if (!msg.ruleId || !msg.line) continue;
      const startLine = msg.line;
      const endLine = msg.endLine && msg.endLine > 0 ? msg.endLine : startLine;
      findings.push({
        tool: "eslint",
        ruleId: msg.ruleId,
        message: msg.message,
        severity: mapSeverity("eslint", msg.severity),
        filepath,
        startLine,
        endLine,
        snippet: readSnippet(absPath, startLine, endLine)
      });
    }
  }

  return findings;
}

function redactSecretSnippet(input: string | undefined): string | undefined {
  if (!input) return undefined;
  return "[REDACTED]";
}

async function runGitleaks(toolPath: string, scanRoot: string, repoRoot: string): Promise<StaticFinding[]> {
  const args = ["detect", "--no-git", "--source", scanRoot, "--report-format", "json"];
  const result = await spawnCapture(toolPath, args, scanRoot);
  if (result.code !== 0 && result.code !== 1) {
    throw new Error(`gitleaks exited with ${result.code}: ${result.stderr.trim()}`);
  }

  const json = JSON.parse(result.stdout || "[]");
  const findings: StaticFinding[] = [];
  if (!Array.isArray(json)) return findings;

  for (const item of json) {
    findings.push({
      tool: "gitleaks",
      ruleId: item.RuleID ?? item.Rule ?? "gitleaks",
      message: item.Description ?? "Secret detected",
      severity: "high",
      filepath: path.relative(repoRoot, item.File ?? ""),
      startLine: item.StartLine ?? item.startLine ?? 0,
      endLine: item.EndLine ?? item.endLine ?? item.StartLine ?? 0,
      snippet: redactSecretSnippet(item.Secret ?? item.Match)
    });
  }

  return findings;
}

function extractCvssSeverity(vuln: any): string | undefined {
  const severities = Array.isArray(vuln?.severity) ? vuln.severity : [];
  for (const sev of severities) {
    if (sev.type === "CVSS_V3" || sev.type === "CVSS_V2") {
      const score = sev.score;
      if (typeof score === "string") {
        const match = score.match(/(\d+\.?\d*)\s*$/);
        if (match) {
          const value = parseFloat(match[1]);
          if (value >= 9.0) return "critical";
          if (value >= 7.0) return "high";
          if (value >= 4.0) return "medium";
          return "low";
        }
      }
    }
  }
  return vuln?.database_specific?.severity;
}

function pickPrimaryAdvisoryId(vulnId: string | undefined, aliases: string[]): string {
  const trimmedId = vulnId?.trim() ?? "";
  const candidates = uniqueStrings([trimmedId, ...aliases]);
  const ghsa = candidates.find((alias) => /^GHSA-/i.test(alias));
  if (ghsa) {
    return ghsa;
  }
  const cve = candidates.find((alias) => /^CVE-/i.test(alias));
  if (cve) {
    return cve;
  }
  return trimmedId;
}

const PINNED_NPM_VERSION_RE =
  /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const isPinnedNpmVersion = (value: string): boolean => {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed === "*" || trimmed.toLowerCase() === "latest") return false;
  if (trimmed.startsWith("^") || trimmed.startsWith("~")) return false;
  if (trimmed.startsWith("<") || trimmed.startsWith(">") || trimmed.startsWith("=")) return false;
  if (trimmed.includes("||")) return false;
  if (trimmed.includes(" ") || trimmed.includes("\t") || trimmed.includes("\n")) return false;
  if (
    trimmed.startsWith("workspace:") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("link:") ||
    trimmed.startsWith("git+") ||
    trimmed.startsWith("github:")
  ) {
    return false;
  }
  return PINNED_NPM_VERSION_RE.test(trimmed);
};

const hasAdjacentLockfile = (manifestPath: string): boolean => {
  const dir = path.dirname(manifestPath);
  const candidates = [
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "pnpm-lock.yaml",
  ];
  return candidates.some((name) => existsSync(path.join(dir, name)));
};

const collectPinnedDeps = (packageJson: unknown): Array<{ name: string; version: string }> => {
  if (!packageJson || typeof packageJson !== "object") return [];
  const record = packageJson as Record<string, unknown>;
  const sections = ["dependencies", "devDependencies", "optionalDependencies"] as const;
  const deps: Array<{ name: string; version: string }> = [];
  for (const section of sections) {
    const raw = record[section];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    for (const [name, versionRaw] of Object.entries(raw as Record<string, unknown>)) {
      if (!name) continue;
      if (typeof versionRaw !== "string") continue;
      if (!isPinnedNpmVersion(versionRaw)) continue;
      deps.push({ name: name.trim(), version: versionRaw.trim() });
    }
  }
  return deps;
};

const osvBatchQuery = async (queries: Array<{ name: string; version: string }>): Promise<any[]> => {
  if (queries.length === 0) return [];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch("https://api.osv.dev/v1/querybatch", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        queries: queries.map((q) => ({
          package: { name: q.name, ecosystem: "npm" },
          version: q.version,
        })),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`osv querybatch failed: ${res.status} ${res.statusText}`);
    }
    const json = (await res.json()) as any;
    return Array.isArray(json?.results) ? json.results : [];
  } finally {
    clearTimeout(timeout);
  }
};

async function scanPinnedNpmDepsInPackageJson(
  config: HadrixConfig,
  scanRoot: string,
  repoRoot: string
): Promise<StaticFinding[]> {
  const manifests = await fg(["**/package.json"], {
    cwd: scanRoot,
    absolute: true,
    dot: true,
    onlyFiles: true,
    followSymbolicLinks: false,
    ignore: config.chunking.exclude ?? [],
  });

  const findings: StaticFinding[] = [];
  const seen = new Set<string>();

  for (const manifestPath of manifests) {
    if (hasAdjacentLockfile(manifestPath)) continue;

    let json: unknown;
    try {
      json = JSON.parse(readFileSync(manifestPath, "utf-8"));
    } catch {
      continue;
    }

    const deps = collectPinnedDeps(json);
    if (deps.length === 0) continue;

    let results: any[];
    try {
      results = await osvBatchQuery(deps);
    } catch {
      continue;
    }

    const filepath = path.relative(repoRoot, manifestPath);
    for (let i = 0; i < deps.length; i += 1) {
      const dep = deps[i];
      const entry = results[i] ?? {};
      const vulnerabilities = Array.isArray(entry?.vulns)
        ? entry.vulns
        : Array.isArray(entry?.vulnerabilities)
          ? entry.vulnerabilities
          : [];

      for (const vuln of vulnerabilities) {
        const summary = vuln?.summary ?? "Vulnerability detected";
        const aliases = Array.isArray(vuln?.aliases)
          ? vuln.aliases.filter((alias: unknown) => typeof alias === "string")
          : [];
        const advisoryId = typeof vuln?.id === "string" ? vuln.id.trim() : "";
        const aliasIds = uniqueStrings([advisoryId, ...aliases].filter(Boolean));
        const primaryId = pickPrimaryAdvisoryId(advisoryId || undefined, aliasIds);
        const ecosystem = "npm";
        const packageName = dep.name;
        const packageVersion = dep.version;
        const packageRuleId = `osv:${packageName}@${packageVersion}`;
        const ecosystemRuleId = `osv:${ecosystem}:${packageName}@${packageVersion}`;
        const severity = mapSeverity("osv-scanner", extractCvssSeverity(vuln));
        const canonicalId = primaryId || advisoryId || aliasIds[0] || "";
        const ruleId = canonicalId || ecosystemRuleId;
        const mergedRuleIds = uniqueStrings([
          ruleId,
          ...aliasIds,
          packageRuleId,
          ecosystemRuleId
        ]);
        const snippet = `Vulnerable package: ${packageName}@${packageVersion} (${ecosystem})`;
        const dedupeKey = `osv|${packageName}@${packageVersion}|${ruleId}|${filepath}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        const message = `${ruleId}: ${summary} in ${packageName}@${packageVersion}`;

        findings.push({
          tool: "osv-scanner",
          ruleId,
          message,
          severity,
          filepath,
          startLine: 0,
          endLine: 0,
          snippet,
          details: {
            packageName,
            packageVersion,
            ecosystem,
            advisoryId: ruleId || null,
            summary,
            aliases: aliasIds.length ? aliasIds : undefined,
            mergedRuleIds,
            dedupeKey,
            identityKey: dedupeKey
          }
        });
      }
    }
  }

  return findings;
}

async function runOsvScanner(
  config: HadrixConfig,
  toolPath: string,
  scanRoot: string,
  repoRoot: string
): Promise<StaticFinding[]> {
  const args = ["--format", "json", "--recursive", scanRoot];
  const result = await spawnCapture(toolPath, args, scanRoot);
  const packageJsonFindings = await scanPinnedNpmDepsInPackageJson(config, scanRoot, repoRoot).catch(() => []);

  if (result.code !== 0 && result.code !== 1) {
    if (result.stderr.includes("no package sources found") || result.stdout.trim() === "") {
      return packageJsonFindings;
    }
    throw new Error(`osv-scanner exited with ${result.code}: ${result.stderr.trim()}`);
  }

  if (!result.stdout.trim()) return packageJsonFindings;
  const json = JSON.parse(result.stdout);
  const findings: StaticFinding[] = [];
  const results = Array.isArray(json?.results) ? json.results : [];
  const seen = new Set<string>();

  for (const entry of results) {
    const sourcePath = entry.source?.path;
    if (!sourcePath) continue;
    const filepath = path.isAbsolute(sourcePath) ? path.relative(repoRoot, sourcePath) : sourcePath;
    const packages = Array.isArray(entry.packages) ? entry.packages : [];

    for (const pkg of packages) {
      const packageInfo = pkg.package ?? {};
      const packageName = packageInfo.name ?? "unknown";
      const packageVersion = packageInfo.version ?? "unknown";
      const ecosystem = packageInfo.ecosystem ?? "unknown";
      const vulnerabilities = Array.isArray(pkg.vulnerabilities) ? pkg.vulnerabilities : [];

      for (const vuln of vulnerabilities) {
        const summary = vuln.summary ?? "Vulnerability detected";
        const aliases = Array.isArray(vuln.aliases)
          ? vuln.aliases.filter((alias: unknown) => typeof alias === "string")
          : [];
        const advisoryId = typeof vuln.id === "string" ? vuln.id.trim() : "";
        const aliasIds = uniqueStrings([advisoryId, ...aliases].filter(Boolean));
        const primaryId = pickPrimaryAdvisoryId(advisoryId || undefined, aliasIds);
        const packageRuleId = `osv:${packageName}@${packageVersion}`;
        const ecosystemRuleId = `osv:${ecosystem}:${packageName}@${packageVersion}`;
        const severity = mapSeverity("osv-scanner", extractCvssSeverity(vuln));
        const canonicalId = primaryId || advisoryId || aliasIds[0] || "";
        const ruleId = canonicalId || ecosystemRuleId;
        const mergedRuleIds = uniqueStrings([
          ruleId,
          ...aliasIds,
          packageRuleId,
          ecosystemRuleId
        ]);
        const snippet = `Vulnerable package: ${packageName}@${packageVersion} (${ecosystem})`;
        const dedupeKey = `osv|${packageName}@${packageVersion}|${ruleId}|${filepath}`;
        if (seen.has(dedupeKey)) {
          continue;
        }
        seen.add(dedupeKey);
        const message = `${ruleId}: ${summary} in ${packageName}@${packageVersion}`;

        findings.push({
          tool: "osv-scanner",
          ruleId,
          message,
          severity,
          filepath,
          startLine: 0,
          endLine: 0,
          snippet,
          details: {
            packageName,
            packageVersion,
            ecosystem,
            advisoryId: ruleId || null,
            summary,
            aliases: aliasIds.length ? aliasIds : undefined,
            mergedRuleIds,
            dedupeKey,
            identityKey: dedupeKey
          }
        });
      }
    }
  }

  return [...findings, ...packageJsonFindings];
}

export async function runStaticScanners(
  config: HadrixConfig,
  scanRoot: string,
  logger?: Logger
): Promise<StaticFinding[]> {
  mkdirSync(getToolsDir(), { recursive: true });
  const { tools, missing } = resolveStaticScannersAvailable(config);

  const logSkip = (tool: string, reason: string) => {
    logger?.warn(`[hadrix] Skipping ${tool} static scanner: ${reason}`);
  };
  const runSafe = async (tool: string, runner: () => Promise<StaticFinding[]>): Promise<StaticFinding[]> => {
    try {
      return await runner();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger?.warn(`[hadrix] ${tool} static scanner failed; skipping. ${message}`);
      return [];
    }
  };

  if (missing.length) {
    for (const tool of missing) {
      logSkip(tool, "missing tool binary. Run 'hadrix setup' to install.");
    }
  }

  logger?.info("Running static scanners (eslint, gitleaks, osv-scanner)...");
  const [eslint, gitleaks, osv] = await Promise.all([
    runSafe("eslint", () => runEslint(config, scanRoot, config.projectRoot, logger)),
    tools.gitleaks
      ? runSafe("gitleaks", () => runGitleaks(tools.gitleaks!, scanRoot, config.projectRoot))
      : Promise.resolve([]),
    tools.osvScanner
      ? runSafe("osv-scanner", () => runOsvScanner(config, tools.osvScanner!, scanRoot, config.projectRoot))
      : Promise.resolve([])
  ]);

  return [...eslint, ...gitleaks, ...osv];
}

export function summarizeStaticFindings(findings: StaticFinding[], maxItems = 50): string {
  if (!findings.length) return "No static findings.";
  const byTool = new Map<string, number>();
  const bySeverity = new Map<string, number>();
  for (const finding of findings) {
    byTool.set(finding.tool, (byTool.get(finding.tool) ?? 0) + 1);
    bySeverity.set(finding.severity, (bySeverity.get(finding.severity) ?? 0) + 1);
  }

  const toolSummary = [...byTool.entries()]
    .map(([tool, count]) => `${tool}: ${count}`)
    .join(", ");
  const severitySummary = [...bySeverity.entries()]
    .map(([severity, count]) => `${severity}: ${count}`)
    .join(", ");

  const top = findings.slice(0, maxItems).map((finding) => {
    const line = finding.startLine ? `:${finding.startLine}` : "";
    return `- ${finding.tool} ${finding.ruleId} ${finding.filepath}${line} — ${finding.message}`;
  });

  return [
    `Counts by tool: ${toolSummary || "none"}`,
    `Counts by severity: ${severitySummary || "none"}`,
    "Sample findings:",
    ...top
  ].join("\n");
}
