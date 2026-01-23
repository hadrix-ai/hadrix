import path from "node:path";
import os from "node:os";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import type { HadrixConfig } from "../config/loadConfig.js";
import type { StaticFinding, Severity } from "../types.js";

interface ToolPaths {
  semgrep: string;
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
  return path.join(os.homedir(), ".hadrix", "tools");
}

function getManagedBinPath(name: string): string {
  const binDir = path.join(getToolsDir(), "bin");
  const ext = process.platform === "win32" ? ".exe" : "";
  return path.join(binDir, `${name}${ext}`);
}

function getSemgrepManagedPath(): string {
  const base = path.join(getToolsDir(), "semgrep");
  if (process.platform === "win32") {
    return path.join(base, "Scripts", "semgrep.exe");
  }
  return path.join(base, "bin", "semgrep");
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

export function resolveToolPath(tool: "semgrep" | "gitleaks" | "osv-scanner", override?: string | null): string | null {
  const candidates: string[] = [];
  if (override) candidates.push(override);
  if (tool === "semgrep") candidates.push(getSemgrepManagedPath());
  candidates.push(getManagedBinPath(tool));
  const onPath = findOnPath(tool);
  if (onPath) candidates.push(onPath);

  for (const candidate of candidates) {
    if (candidate && isExecutable(candidate)) return candidate;
  }

  return null;
}

export function assertStaticScannersAvailable(config: HadrixConfig): ToolPaths {
  const semgrep = resolveToolPath("semgrep", config.staticScanners.semgrep.path);
  const gitleaks = resolveToolPath("gitleaks", config.staticScanners.gitleaks.path);
  const osvScanner = resolveToolPath("osv-scanner", config.staticScanners.osvScanner.path);

  const missing: string[] = [];
  if (!semgrep) missing.push("semgrep");
  if (!gitleaks) missing.push("gitleaks");
  if (!osvScanner) missing.push("osv-scanner");

  if (missing.length) {
    throw new Error(
      `Missing required static scanners: ${missing.join(", ")}. Run 'hadrix setup' to install them.`
    );
  }

  return { semgrep, gitleaks, osvScanner };
}

function mapSeverity(tool: StaticFinding["tool"], raw: string | number | undefined): Severity {
  if (tool === "eslint") {
    if (raw === 2) return "high";
    if (raw === 1) return "medium";
    return "info";
  }
  const value = (typeof raw === "string" ? raw : "").toLowerCase();
  if (tool === "semgrep") {
    if (value === "error") return "high";
    if (value === "warning") return "medium";
    if (value === "info") return "info";
    return "info";
  }
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

async function spawnCapture(command: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
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

async function runEslint(config: HadrixConfig, scanRoot: string, repoRoot: string): Promise<StaticFinding[]> {
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
    console.warn(
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

async function runSemgrep(config: HadrixConfig, toolPath: string, scanRoot: string, repoRoot: string): Promise<StaticFinding[]> {
  const args = [
    "scan",
    "--json",
    "--metrics=off",
    "--disable-version-check",
    "--timeout",
    String(config.staticScanners.semgrep.timeoutSeconds)
  ];
  for (const cfg of config.staticScanners.semgrep.configs) {
    args.push("--config", cfg);
  }
  for (const exclude of config.chunking.exclude) {
    args.push("--exclude", exclude);
  }

  const result = await spawnCapture(toolPath, args, scanRoot);
  if (result.code !== 0 && result.code !== 1) {
    throw new Error(`semgrep exited with ${result.code}: ${result.stderr.trim()}`);
  }

  const json = JSON.parse(result.stdout || "{}");
  const results = Array.isArray(json?.results) ? json.results : [];
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
  for (const entry of results) {
    const filePathRaw = entry.path as string | undefined;
    if (!filePathRaw) continue;
    const absPath = path.isAbsolute(filePathRaw) ? filePathRaw : path.join(scanRoot, filePathRaw);
    const filepath = path.relative(repoRoot, absPath);
    const startLine = entry.start?.line ?? 0;
    const endLine = entry.end?.line ?? startLine;
    const message = entry.extra?.message ?? entry.check_id ?? "Semgrep issue";
    const severity = mapSeverity("semgrep", entry.extra?.severity ?? "info");

    findings.push({
      tool: "semgrep",
      ruleId: entry.check_id ?? "semgrep",
      message,
      severity,
      filepath,
      startLine,
      endLine,
      snippet: readSnippet(absPath, startLine, endLine)
    });
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

async function runOsvScanner(toolPath: string, scanRoot: string, repoRoot: string): Promise<StaticFinding[]> {
  const args = ["--format", "json", "--recursive", scanRoot];
  const result = await spawnCapture(toolPath, args, scanRoot);
  if (result.code !== 0 && result.code !== 1) {
    if (result.stderr.includes("no package sources found") || result.stdout.trim() === "") {
      return [];
    }
    throw new Error(`osv-scanner exited with ${result.code}: ${result.stderr.trim()}`);
  }

  if (!result.stdout.trim()) return [];
  const json = JSON.parse(result.stdout);
  const findings: StaticFinding[] = [];
  const results = Array.isArray(json?.results) ? json.results : [];
  const grouped = new Map<
    string,
    {
      filepath: string;
      packageName: string;
      packageVersion: string;
      ecosystem: string;
      advisories: Array<{ id: string; summary: string; severity: Severity; aliases?: string[] }>;
      severity: Severity;
    }
  >();

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
        const key = `${filepath}|${ecosystem}|${packageName}|${packageVersion}`;
        let group = grouped.get(key);
        if (!group) {
          group = {
            filepath,
            packageName,
            packageVersion,
            ecosystem,
            advisories: [],
            severity: "info"
          };
          grouped.set(key, group);
        }
        const vulnId = vuln.id ?? "unknown";
        const summary = vuln.summary ?? "Vulnerability detected";
        const severity = mapSeverity("osv-scanner", extractCvssSeverity(vuln));
        const aliases = Array.isArray(vuln.aliases)
          ? vuln.aliases.filter((alias: unknown) => typeof alias === "string")
          : undefined;
        group.advisories.push({ id: vulnId, summary, severity, aliases });
        if (severityRank(severity) > severityRank(group.severity)) {
          group.severity = severity;
        }
      }
    }
  }

  for (const group of grouped.values()) {
    const snippet = `Vulnerable package: ${group.packageName}@${group.packageVersion} (${group.ecosystem})`;
    const advisoryCount = group.advisories.length;
    const message =
      advisoryCount === 1
        ? `${group.advisories[0]!.summary} in ${group.packageName}@${group.packageVersion}`
        : `${advisoryCount} vulnerabilities in ${group.packageName}@${group.packageVersion}`;
    const ruleId = `osv:${group.ecosystem}:${group.packageName}@${group.packageVersion}`;

    findings.push({
      tool: "osv-scanner",
      ruleId,
      message,
      severity: group.severity,
      filepath: group.filepath,
      startLine: 0,
      endLine: 0,
      snippet,
      details: {
        packageName: group.packageName,
        packageVersion: group.packageVersion,
        ecosystem: group.ecosystem,
        advisories: group.advisories
      }
    });
  }

  return findings;
}

export async function runStaticScanners(config: HadrixConfig, scanRoot: string, logger?: (message: string) => void): Promise<StaticFinding[]> {
  mkdirSync(getToolsDir(), { recursive: true });
  const tools = assertStaticScannersAvailable(config);

  logger?.("Running static scanners (eslint, semgrep, gitleaks, osv-scanner)...");
  const [eslint, semgrep, gitleaks, osv] = await Promise.all([
    runEslint(config, scanRoot, config.projectRoot),
    runSemgrep(config, tools.semgrep, scanRoot, config.projectRoot),
    runGitleaks(tools.gitleaks, scanRoot, config.projectRoot),
    runOsvScanner(tools.osvScanner, scanRoot, config.projectRoot)
  ]);

  return [...eslint, ...semgrep, ...gitleaks, ...osv];
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
