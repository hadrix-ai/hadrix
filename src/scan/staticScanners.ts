import path from "node:path";
import os from "node:os";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";
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
  // Allow explicit override (useful in CI, containers, and sudo scenarios).
  const override = (process.env.HADRIX_TOOLS_DIR || "").trim();
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
  const sudoUser = (process.env.SUDO_USER || "").trim();
  if (sudoUser) {
    const sudoHome = lookupHomeDir(sudoUser);
    if (sudoHome) candidates.push(path.join(sudoHome, ".hadrix", "tools"));
  }

  // If HOME is set and differs from os.homedir(), consider it too.
  const envHome = (process.env.HOME || "").trim();
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

function findHomeInstalledTool(tool: "semgrep" | "gitleaks" | "osv-scanner"): string[] {
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
    const candidate =
      tool === "semgrep"
        ? getSemgrepManagedPath(toolsDir)
        : getManagedBinPath(tool, toolsDir);

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

function getSemgrepManagedPath(toolsDir: string): string {
  const base = path.join(toolsDir, "semgrep");
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

export function resolveToolPath(
  tool: "semgrep" | "gitleaks" | "osv-scanner",
  override?: string | null
): string | null {
  const candidates: string[] = [];
  if (override) candidates.push(override);

  for (const toolsDir of getToolsDirCandidates()) {
    if (tool === "semgrep") candidates.push(getSemgrepManagedPath(toolsDir));
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
  type OsvAggregate = {
    packageName: string;
    packageVersion: string;
    ecosystems: Set<string>;
    filepaths: Set<string>;
    advisoryIds: Set<string>;
    summaries: Set<string>;
    mergedRuleIds: Set<string>;
    severity: Severity;
  };
  const aggregated = new Map<string, OsvAggregate>();

  const ensureAggregate = (key: string, packageName: string, packageVersion: string): OsvAggregate => {
    let aggregate = aggregated.get(key);
    if (!aggregate) {
      aggregate = {
        packageName,
        packageVersion,
        ecosystems: new Set<string>(),
        filepaths: new Set<string>(),
        advisoryIds: new Set<string>(),
        summaries: new Set<string>(),
        mergedRuleIds: new Set<string>(),
        severity: "low"
      };
      aggregated.set(key, aggregate);
    }
    return aggregate;
  };

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
      const packageKey = `${ecosystem}:${packageName}@${packageVersion}`;
      const aggregate = ensureAggregate(packageKey, packageName, packageVersion);
      aggregate.ecosystems.add(ecosystem);
      aggregate.filepaths.add(filepath);

      for (const vuln of vulnerabilities) {
        const summary = typeof vuln.summary === "string" ? vuln.summary.trim() : "Vulnerability detected";
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
        const mergedRuleIds = uniqueStrings([
          canonicalId,
          ...aliasIds,
          packageRuleId,
          ecosystemRuleId
        ]);

        if (canonicalId) {
          aggregate.advisoryIds.add(canonicalId);
        }
        if (summary) {
          aggregate.summaries.add(summary);
        }
        for (const id of mergedRuleIds) {
          aggregate.mergedRuleIds.add(id);
        }
        if (severityRank(severity) > severityRank(aggregate.severity)) {
          aggregate.severity = severity;
        }
      }
    }
  }

  for (const aggregate of aggregated.values()) {
    const ecosystemList = Array.from(aggregate.ecosystems);
    const ecosystem = ecosystemList[0] ?? "unknown";
    const packageKey = `${aggregate.packageName}@${aggregate.packageVersion}`;
    const ruleId = `osv:${ecosystem}:${packageKey}`;
    const advisoryIds = Array.from(aggregate.advisoryIds);
    const summaries = Array.from(aggregate.summaries);
    const advisoryCount = advisoryIds.length || summaries.length;
    const summary = advisoryCount
      ? `${advisoryCount} advisories for ${packageKey}`
      : `Advisories for ${packageKey}`;
    const snippet = `Vulnerable package: ${packageKey} (${ecosystemList.join(", ") || "unknown"})`;
    const dedupeKey = `osv|${ecosystem}:${packageKey}`;
    const filepath = Array.from(aggregate.filepaths)[0] ?? "";

    findings.push({
      tool: "osv-scanner",
      ruleId,
      message: `${ruleId}: ${summary}`,
      severity: aggregate.severity,
      filepath,
      startLine: 0,
      endLine: 0,
      snippet,
      details: {
        packageName: aggregate.packageName,
        packageVersion: aggregate.packageVersion,
        ecosystem,
        ecosystems: ecosystemList.length > 1 ? ecosystemList : undefined,
        advisoryIds: advisoryIds.length ? advisoryIds : undefined,
        summaries: summaries.length ? summaries : undefined,
        mergedRuleIds: aggregate.mergedRuleIds.size ? Array.from(aggregate.mergedRuleIds) : undefined,
        files: aggregate.filepaths.size ? Array.from(aggregate.filepaths) : undefined,
        dedupeKey,
        identityKey: dedupeKey
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
