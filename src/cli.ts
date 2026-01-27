#!/usr/bin/env node
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Command } from "commander";
import pc from "picocolors";
import { runScan } from "./scan/runScan.js";
import { formatFindingsText, formatScanResultCoreJson, formatScanResultJson } from "./report/formatters.js";
import { formatEvalsText, runEvals, writeEvalArtifacts } from "./evals/runEvals.js";
import { runSetup } from "./setup/runSetup.js";
import { promptHidden, promptSelect, promptYesNo } from "./ui/prompts.js";
import type { ExistingScanFinding } from "./types.js";

const program = new Command();

class Spinner {
  private frames = ["-", "\\", "|", "/"];
  private frameIndex = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private text = "";

  constructor(private stream: { isTTY?: boolean; write: (chunk: string) => void }) {}

  start(text: string) {
    this.text = text;
    if (!this.stream.isTTY) return;
    if (this.timer) return;
    this.render();
    this.timer = setInterval(() => this.render(), 120);
  }

  update(text: string) {
    this.text = text;
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.clear();
  }

  private render() {
    if (!this.stream.isTTY) return;
    const frame = this.frames[this.frameIndex % this.frames.length];
    this.frameIndex += 1;
    this.stream.write(`\r\x1b[2K${frame} ${this.text}`);
  }

  private clear() {
    if (!this.stream.isTTY) return;
    this.stream.write("\r\x1b[2K");
  }
}

async function loadExistingFindings(input?: string): Promise<ExistingScanFinding[] | undefined> {
  if (!input) return undefined;
  const candidatePath = path.resolve(process.cwd(), input);
  const raw = existsSync(candidatePath) ? await readFile(candidatePath, "utf-8") : input;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`existing findings JSON invalid: ${message}`);
  }
  if (Array.isArray(parsed)) {
    return parsed as ExistingScanFinding[];
  }
  if (parsed && typeof parsed === "object" && Array.isArray((parsed as any).findings)) {
    return (parsed as any).findings as ExistingScanFinding[];
  }
  throw new Error("existing findings must be a JSON array or { findings: [...] }.");
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "0s";
  const totalSeconds = durationMs / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds - minutes * 60);
  return `${minutes}m ${seconds}s`;
}

function buildSupabaseConnectionString(raw: string, password?: string | null): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Supabase project URL is required.");
  }

  const lowered = trimmed.toLowerCase();
  if (lowered.startsWith("postgresql://") || lowered.startsWith("postgres://")) {
    throw new Error("Please enter the Supabase project URL (not a connection string).");
  }

  const normalized = trimmed.startsWith("http://") || trimmed.startsWith("https://")
    ? trimmed
    : `https://${trimmed}`;
  let hostname = "";
  try {
    hostname = new URL(normalized).hostname.toLowerCase();
  } catch {
    hostname = lowered;
  }
  if (!hostname) {
    throw new Error("Supabase project URL is invalid.");
  }

  let projectRef = hostname;
  if (projectRef.startsWith("db.")) {
    projectRef = projectRef.slice(3);
  }
  if (projectRef.endsWith(".supabase.co")) {
    projectRef = projectRef.slice(0, -".supabase.co".length);
  } else if (projectRef.endsWith(".supabase.com")) {
    projectRef = projectRef.slice(0, -".supabase.com".length);
  }

  projectRef = projectRef.trim();
  if (!projectRef) {
    throw new Error("Supabase project URL is missing a project reference.");
  }
  const secret = password?.trim();
  if (!secret) {
    throw new Error("Supabase DB password is required.");
  }
  const encoded = encodeURIComponent(secret);
  return `postgresql://postgres:${encoded}@db.${projectRef}.supabase.co:5432/postgres`;
}

function isMissingScannersError(message: string): boolean {
  return (
    message.includes("Missing required static scanners:") ||
    message.includes("Missing required jelly call graph analyzer.")
  );
}

program
  .name("hadrix")
  .description("Hadrix local security scan")
  .version("0.1.0");

program
  .command("scan [target]")
  .description("Scan a project directory")
  .option("-c, --config <path>", "Path to hadrix.config.json")
  .option("-f, --format <format>", "Output format (text|json|core-json)")
  .option("--json", "Shortcut for --format json")
  .option("--repo-path <path>", "Scope scan to a subdirectory (monorepo)")
  .option("--no-repo-path-inference", "Disable repoPath inference for monorepo roots")
  .option("--skip-static", "Skip running static scanners")
  .option("--supabase", "Connect to Supabase and include schema-based checks")
  .option("--supabase-url <string>", "Supabase project URL")
  .option("--supabase-password <password>", "Supabase DB password (replaces placeholder)")
  .option("--supabase-schema <path>", "Supabase schema snapshot JSON (no DB connection)")
  .option("--existing-findings <path>", "Existing findings JSON array or file path")
  .option("--repo-full-name <name>", "Repository full name for metadata")
  .option("--repo-id <id>", "Repository id for metadata")
  .option("--commit-sha <sha>", "Commit SHA for metadata")
  .option("--debug", "Enable debug logging to a file")
  .option("--debug-log <path>", "Path to write debug log (implies --debug)")
  .action(async (
    target: string | undefined,
    options: {
      config?: string;
      format?: string;
      json?: boolean;
      repoPath?: string;
      repoPathInference?: boolean;
      skipStatic?: boolean;
      supabase?: boolean;
      supabaseUrl?: string;
      supabasePassword?: string;
      supabaseSchema?: string;
      existingFindings?: string;
      repoFullName?: string;
      repoId?: string;
      commitSha?: string;
      debug?: boolean;
      debugLog?: string;
    }
  ) => {
    const projectRoot = path.resolve(process.cwd(), target ?? ".");
    const format = options.json ? "json" : options.format ?? "text";
    const isJsonOutput = format === "json" || format === "core-json";
    const useSpinner = !isJsonOutput && process.stderr.isTTY;
    const spinner = useSpinner ? new Spinner(process.stderr) : null;
    const scanStart = Date.now();
    let statusMessage = "Running scan...";

    const envSupabaseUrl = process.env.HADRIX_SUPABASE_URL;
    const envSupabasePassword = process.env.HADRIX_SUPABASE_PASSWORD;
    const envSupabaseSchema = process.env.HADRIX_SUPABASE_SCHEMA_PATH;
    let supabaseConnectionString: string | null = null;
    let supabaseSchemaPath: string | null = null;
    let supabaseExplicitlySkipped = false;
    const wantsSupabase = Boolean(
      options.supabase ||
        options.supabaseUrl ||
        options.supabasePassword ||
        options.supabaseSchema ||
        envSupabaseUrl ||
        envSupabasePassword ||
        envSupabaseSchema
    );
    if (wantsSupabase) {
      supabaseSchemaPath = options.supabaseSchema ?? envSupabaseSchema ?? null;
      if (!supabaseSchemaPath) {
        let conn = options.supabaseUrl ?? envSupabaseUrl ?? "";
        let password = options.supabasePassword ?? envSupabasePassword ?? null;
        if (!conn && process.stdin.isTTY && !isJsonOutput) {
          conn = await promptHidden("Supabase project URL: ");
        }
        if (!password && process.stdin.isTTY && !isJsonOutput) {
          password = await promptHidden("Supabase DB password: ");
        }
        if (!conn.trim()) {
          throw new Error("Supabase connection string is required.");
        }
        supabaseConnectionString = buildSupabaseConnectionString(conn, password);
      }
    } else if (process.stdin.isTTY && !isJsonOutput) {
      const dbPrompt = [
        "Would you like to also scan your database for misconfigured RLS, column privileges, public storage, and more?",
        "This is strongly recommended as most security issues for vibe coders are in database misconfigurations.",
        "All data is stored locally on your device, never on any of our servers.",
        "See https://cli.hadrix.ai for more information and see our OSS code https://github.com/hadrix-ai/hadrix.",
        "",
        "Select a database provider:"
      ].join("\n");
      const choice = await promptSelect(dbPrompt, ["Supabase", "Skip"], {
        defaultIndex: 1
      });
      if (choice === 0) {
        const conn = await promptHidden("Supabase project URL: ");
        const password = await promptHidden("Supabase DB password: ");
        if (conn.trim()) {
          supabaseConnectionString = buildSupabaseConnectionString(conn, password);
        }
      } else {
        supabaseExplicitlySkipped = true;
      }
    }

    const formatElapsed = () => formatDuration(Date.now() - scanStart);
    const formatStatus = (message: string) => `${message} (elapsed ${formatElapsed()})`;
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;

    const logger = (message: string) => {
      if (isJsonOutput) return;
      if (spinner) {
        statusMessage = message;
        spinner.update(formatStatus(statusMessage));
        return;
      }
      console.error(message);
    };

    try {
      if (spinner) {
        spinner.start(formatStatus(statusMessage));
        elapsedTimer = setInterval(() => {
          spinner.update(formatStatus(statusMessage));
        }, 1000);
      }
      const existingFindings = await loadExistingFindings(options.existingFindings);
      let attemptedSetup = false;
      const runScanOnce = async () =>
        await runScan({
          projectRoot,
          configPath: options.config,
          repoPath: options.repoPath,
          inferRepoPath: options.repoPathInference,
          skipStatic: options.skipStatic ?? false,
          existingFindings,
          repoFullName: options.repoFullName,
          repositoryId: options.repoId,
          commitSha: options.commitSha,
          logger,
          debug: options.debug,
          debugLogPath: options.debugLog,
          supabase: supabaseSchemaPath
            ? { schemaSnapshotPath: supabaseSchemaPath }
            : supabaseConnectionString
              ? { connectionString: supabaseConnectionString }
              : supabaseExplicitlySkipped
                ? null
                : undefined
        });

      let result;
      try {
        result = await runScanOnce();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const shouldPrompt =
          isMissingScannersError(message) && !attemptedSetup && !isJsonOutput;
        if (!shouldPrompt) {
          throw err;
        }
        spinner?.stop();
        if (elapsedTimer) {
          clearInterval(elapsedTimer);
          elapsedTimer = null;
        }
        attemptedSetup = true;
        const ok = await promptYesNo("Static scanners missing. Run 'hadrix setup' now?", {
          defaultYes: true
        });
        if (!ok) {
          throw err;
        }
        await runSetup({ autoYes: false, logger: (msg) => console.log(msg) });
        if (spinner) {
          spinner.start(formatStatus(statusMessage));
          elapsedTimer = setInterval(() => {
            spinner.update(formatStatus(statusMessage));
          }, 1000);
        }
        result = await runScanOnce();
      }

      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      spinner?.stop();

      if (format === "json") {
        console.log(formatScanResultJson(result));
      } else if (format === "core-json") {
        console.log(formatScanResultCoreJson(result));
      } else {
        console.log(formatFindingsText(result.findings));
        console.log(`\nScan completed in ${formatDuration(result.durationMs)}.`);
      }

      process.exitCode = result.findings.length ? 1 : 0;
    } catch (err) {
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      spinner?.stop();
      const message = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`Error: ${message}`));
      process.exitCode = 2;
    }
  });

program
  .command("evals [fixturesDir]")
  .description("Run Hadrix eval suites locally against fixture repos")
  .option("--fixtures <path>", "Directory containing eval fixture repos")
  .option("--spec <id>", "Eval spec id or repo full name")
  .option("--group <id>", "Eval group id")
  .option("--repo <path>", "Path to a fixture repo (requires --spec)")
  .option("--config <path>", "Path to hadrix.config.json (relative to repo root)")
  .option("--repo-path <path>", "Scope scan to a subdirectory (monorepo)")
  .option("--no-repo-path-inference", "Disable repoPath inference for eval scans")
  .option("--threshold <num>", "Summary match threshold (0-1)")
  .option("--short-circuit <num>", "Short-circuit threshold (0-1)")
  .option("--concurrency <num>", "Comparator concurrency")
  .option("--out-dir <path>", "Directory for eval artifacts (default .hadrix-evals)")
  .option("--json", "Output JSON instead of text")
  .option("--skip-static", "Skip static scanners")
  .option("--debug", "Enable debug logging to a file")
  .option("--debug-log <path>", "Path to write debug log (implies --debug)")
  .action(async (fixturesDir: string | undefined, options: {
    fixtures?: string;
    spec?: string;
    group?: string;
    repo?: string;
    config?: string;
    repoPath?: string;
    repoPathInference?: boolean;
    threshold?: string;
    shortCircuit?: string;
    concurrency?: string;
    outDir?: string;
    json?: boolean;
    skipStatic?: boolean;
    debug?: boolean;
    debugLog?: string;
  }) => {
    const output = options.json ? "json" : "text";
    const useSpinner = output !== "json" && process.stderr.isTTY;
    const spinner = useSpinner ? new Spinner(process.stderr) : null;
    const evalStart = Date.now();
    let statusMessage = "Running evals...";
    const deferredLogs: string[] = [];

    const formatElapsed = () => formatDuration(Date.now() - evalStart);
    const formatStatus = (message: string) => `${message} (elapsed ${formatElapsed()})`;
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;

    const logger = (message: string) => {
      if (output === "json") return;
      if (spinner) {
        if (message.startsWith("Dedupe report saved to") || message.length > 120) {
          deferredLogs.push(message);
          return;
        }
        statusMessage = message;
        spinner.update(formatStatus(statusMessage));
        return;
      }
      console.error(message);
    };

    const parseNumber = (value?: string): number | undefined => {
      if (!value) return undefined;
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return undefined;
      return parsed;
    };

    const fixtures = fixturesDir ?? options.fixtures;
    const outDir = options.outDir ? path.resolve(process.cwd(), options.outDir) : path.resolve(process.cwd(), ".hadrix-evals");
    const debugLogPath = options.debugLog
      ? path.resolve(process.cwd(), options.debugLog)
      : options.debug
        ? path.join(outDir, "logs")
        : null;
    if (options.debug && !options.debugLog && debugLogPath) {
      await mkdir(debugLogPath, { recursive: true });
    }

    try {
      if (spinner) {
        spinner.start(formatStatus(statusMessage));
        elapsedTimer = setInterval(() => {
          spinner.update(formatStatus(statusMessage));
        }, 1000);
      }
      const result = await runEvals({
        fixturesDir: fixtures ?? null,
        specId: options.spec ?? null,
        groupId: options.group ?? null,
        repo: options.repo ?? null,
        configPath: options.config ?? null,
        repoPath: options.repoPath ?? null,
        inferRepoPath: options.repoPathInference,
        summaryMatchThreshold: parseNumber(options.threshold),
        shortCircuitThreshold: parseNumber(options.shortCircuit),
        comparisonConcurrency: parseNumber(options.concurrency),
        debug: options.debug,
        debugLogPath,
        output,
        skipStatic: options.skipStatic,
        logger,
      });

      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      spinner?.stop();
      if (deferredLogs.length) {
        for (const line of deferredLogs) {
          console.log(line);
        }
      }

      await writeEvalArtifacts(result, outDir).catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        logger(`Failed to write eval artifacts: ${message}`);
      });

      if (output === "json") {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatEvalsText(result));
        console.log(`\\nArtifacts written to ${outDir}`);
      }

      process.exitCode = result.pass ? 0 : 1;
    } catch (err) {
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      spinner?.stop();
      if (deferredLogs.length) {
        for (const line of deferredLogs) {
          console.log(line);
        }
      }
      const message = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`Error: ${message}`));
      process.exitCode = 2;
    }
  });

program
  .command("setup")
  .description("Install required scanners and jelly call graph analyzer")
  .option("-y, --yes", "Install without prompting")
  .action(async (options: { yes?: boolean }) => {
    try {
      const results = await runSetup({
        autoYes: options.yes ?? false,
        logger: (message) => console.log(message)
      });
      const failed = results.filter((result) => !result.installed && !result.optional);
      if (failed.length) {
        console.error(
          pc.red(`Setup incomplete. Missing: ${failed.map((r) => r.tool).join(", ")}.`)
        );
        process.exitCode = 1;
      } else {
        console.log(pc.green("Setup complete."));
        process.exitCode = 0;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`Setup failed: ${message}`));
      process.exitCode = 1;
    }
  });

program.parse(process.argv);
