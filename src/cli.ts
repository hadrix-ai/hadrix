#!/usr/bin/env node
import path from "node:path";
import { mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Command, Option } from "commander";
import pc from "picocolors";
import { readEnvRaw } from "./config/env.js";
import { SUPABASE_SCHEMA_SCAN_FLAG, isSupabaseSchemaScanEnabled } from "./config/featureFlags.js";
import { defaultLlmModel, powerLlmModel } from "./config/defaults.js";
import { runScan } from "./scan/runScan.js";
import { formatFindingsText, formatScanResultCoreJson, formatScanResultJson } from "./report/formatters.js";
import { formatEvalsText, runEvals, writeEvalArtifacts } from "../evals/runner/runEvals.js";
import { runSetup } from "./setup/runSetup.js";
import { clearScanResumeState, loadScanResumeState } from "./scan/scanResume.js";
import { promptHidden, promptSelect, promptYesNo } from "./ui/prompts.js";
import { createAppLogger, noopLogger, type AppLogger, type Logger } from "./logging/logger.js";
import type { ScanProgressEvent, ScanProgressPhase, ScanProgressHandler } from "./scan/progress.js";
import type { ExistingScanFinding } from "./types.js";

const program = new Command();
type UiLogger = Logger & { pause?: () => void; resume?: () => void };

const DEFAULT_LLM_MODEL_OPENAI = defaultLlmModel("openai");
const DEFAULT_LLM_MODEL_ANTHROPIC = defaultLlmModel("anthropic");
const POWER_LLM_MODEL_OPENAI = powerLlmModel("openai");
const POWER_LLM_MODEL_ANTHROPIC = powerLlmModel("anthropic");
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

const PROGRESS_PHASE_LABELS: Record<ScanProgressPhase, string> = {
  static_scanners: "Static scanners",
  llm_map: "LLM map",
  llm_rule: "LLM rule eval",
  llm_open: "LLM open scan",
  llm_composite: "LLM composite",
  postprocess: "Post-processing"
};

const PROGRESS_PHASE_WEIGHTS: Record<ScanProgressPhase, number> = {
  static_scanners: 1,
  llm_map: 4,
  llm_rule: 8,
  llm_open: 3,
  llm_composite: 1,
  postprocess: 1
};

function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function renderProgressBar(value: number, width = 24): string {
  const normalized = clampProgress(value);
  const filled = Math.round(normalized * width);
  const empty = Math.max(0, width - filled);
  const bar = `${"#".repeat(filled)}${"-".repeat(empty)}`;
  const percent = Math.round(normalized * 100);
  return `[${bar}] ${percent}%`;
}

function createProgressReporter(update: (message: string) => void): ScanProgressHandler {
  const fractions = new Map<ScanProgressPhase, number>();
  const phases = Object.keys(PROGRESS_PHASE_WEIGHTS) as ScanProgressPhase[];
  phases.forEach((phase) => fractions.set(phase, 0));

  return (event: ScanProgressEvent) => {
    const total = Math.max(0, Math.trunc(event.total));
    const current = Math.max(0, Math.trunc(event.current));
    const fraction = total === 0 ? 1 : clampProgress(current / total);
    fractions.set(event.phase, fraction);

    const weightedTotal = phases.reduce((sum, phase) => sum + PROGRESS_PHASE_WEIGHTS[phase], 0);
    const weightedCompleted = phases.reduce(
      (sum, phase) => sum + PROGRESS_PHASE_WEIGHTS[phase] * (fractions.get(phase) ?? 0),
      0
    );
    const overall = weightedTotal ? weightedCompleted / weightedTotal : 0;
    const bar = renderProgressBar(overall);
    const label = PROGRESS_PHASE_LABELS[event.phase] ?? event.phase;
    const detail =
      total === 0
        ? event.message ?? "skipped"
        : `${Math.min(current, total)}/${total}`;
    update(`${bar} ${label} (${detail})`);
  };
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

function shouldSuppressCliError(message: string): boolean {
  const lowered = message.toLowerCase();
  if (lowered.includes("claude.com/en/api/rate-limits")) return true;
  if (lowered.includes("anthropic.com/contact-sales")) return true;
  if (lowered.includes("output token limit")) return true;
  if (lowered.includes("llm response incomplete")) return true;
  return lowered.includes("organization's rate limit") && lowered.includes("input tokens per minute");
}

function logCliError(logger: Logger, message: string): void {
  if (shouldSuppressCliError(message)) {
    logger.debug(`Suppressed CLI error: ${message}`);
    return;
  }
  logger.error(`Error: ${message}`);
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
    throw new Error("Supabase database password is required.");
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
  .description("Hadrix local security scan (OpenAI Responses API by default; Anthropic Messages API via SDKs)")
  .version("0.1.0");

program
  .command("scan [target]")
  .description("Scan a project directory")
  .addOption(new Option("-c, --config <path>", "Path to hadrix.config.json").hideHelp())
  .option("-f, --format <format>", "Output format (text|json|core-json)")
  .option("--json", "Shortcut for --format json")
  .addOption(new Option("--repo-path <path>", "Scope scan to a subdirectory (monorepo)").hideHelp())
  .addOption(
    new Option("--no-repo-path-inference", "Disable repoPath inference for monorepo roots").hideHelp()
  )
  .option("--skip-static", "Skip running static scanners")
  .addOption(new Option("--supabase", "Connect to Supabase and include schema-based checks").hideHelp())
  .addOption(new Option("--supabase-url <string>", "Supabase project URL").hideHelp())
  .addOption(new Option("--supabase-password <password>", "Supabase DB password (replaces placeholder)").hideHelp())
  .addOption(new Option("--supabase-schema <path>", "Supabase schema snapshot JSON (no DB connection)").hideHelp())
  .addOption(
    new Option("--existing-findings <path>", "Existing findings JSON array or file path").hideHelp()
  )
  .addOption(new Option("--repo-full-name <name>", "Repository full name for metadata").hideHelp())
  .addOption(new Option("--repo-id <id>", "Repository id for metadata").hideHelp())
  .addOption(new Option("--commit-sha <sha>", "Commit SHA for metadata").hideHelp())
  .option(
    "--power",
    `Power mode switches the model from the default lightweight models (${DEFAULT_LLM_MODEL_OPENAI}, ${DEFAULT_LLM_MODEL_ANTHROPIC}) to more capable models (${POWER_LLM_MODEL_OPENAI}, ${POWER_LLM_MODEL_ANTHROPIC}). Power mode gives more thorough results at higher cost. The default lightweight mode is optimal for more frequent scans or CI/CD use cases.`
  )
  .option("--debug", "Enable debug logging")
  .addOption(new Option("--debug-log <path>", "Path to write debug log (implies --debug)").hideHelp())
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
      power?: boolean;
      debug?: boolean;
      debugLog?: string;
    }
  ) => {
    const projectRoot = path.resolve(process.cwd(), target ?? ".");
    const format = options.json ? "json" : options.format ?? "text";
    const isJsonOutput = format === "json" || format === "core-json";
    const useStatusSpinner = !isJsonOutput && process.stdout.isTTY;
    const statusSpinner = useStatusSpinner ? new Spinner(process.stdout) : null;
    // When stdout is being piped (or we're emitting JSON), keep progress UI on stderr so users
    // still get interactive feedback without polluting stdout.
    const useProgressSpinner = !useStatusSpinner && process.stderr.isTTY;
    const progressSpinner = useProgressSpinner ? new Spinner(process.stderr) : null;
    let scanStart = Date.now();
    let statusMessage = "Running scan...";
    let progressMessage = statusMessage;
    const powerMode = Boolean(options.power);

    const stateDir = path.join(projectRoot, ".hadrix");
    let appLogger: AppLogger | null = null;
    try {
      appLogger = await createAppLogger({ stateDir, label: "scan" });
    } catch {
      appLogger = null;
    }
    const appLog = appLogger ?? noopLogger;
    let loggerPaused = false;
    let pausedAt: number | null = null;
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;
    const formatElapsed = () => formatDuration(Date.now() - scanStart);
    const formatStatus = (message: string) => `${message} (elapsed ${formatElapsed()})`;
    const logUi = (level: "info" | "warn" | "error", message: string, uiMessage?: string) => {
      appLog[level](message);
      if (isJsonOutput) return;
      if (statusSpinner && !loggerPaused) {
        statusMessage = uiMessage ?? message;
        statusSpinner.update(formatStatus(statusMessage));
        return;
      }
      console.log(uiMessage ?? message);
    };
    const uiLogger: UiLogger = {
      info: (message, meta) => {
        appLog.info(message, meta);
        if (isJsonOutput) return;
        if (statusSpinner && !loggerPaused) {
          statusMessage = message;
          statusSpinner.update(formatStatus(statusMessage));
          return;
        }
        console.log(message);
      },
      warn: (message, meta) => logUi("warn", message, pc.yellow(message)),
      error: (message, meta) => logUi("error", message, pc.red(message)),
      debug: (message, meta) => appLog.debug(message, meta)
    };
    uiLogger.pause = () => {
      loggerPaused = true;
      if (pausedAt === null) {
        pausedAt = Date.now();
      }
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      statusSpinner?.stop();
      progressSpinner?.stop();
    };
    uiLogger.resume = () => {
      if (pausedAt !== null) {
        scanStart += Date.now() - pausedAt;
        pausedAt = null;
      }
      loggerPaused = false;
      if (!statusSpinner && !progressSpinner) return;
      statusSpinner?.start(formatStatus(statusMessage));
      progressSpinner?.start(formatStatus(progressMessage));
      if (!elapsedTimer) {
        elapsedTimer = setInterval(() => {
          statusSpinner?.update(formatStatus(statusMessage));
          progressSpinner?.update(formatStatus(progressMessage));
        }, 1000);
      }
    };
    const updateStatus = (message: string) => {
      if (!statusSpinner || loggerPaused) return;
      statusMessage = message;
      statusSpinner.update(formatStatus(statusMessage));
    };
    const updateProgress = (message: string) => {
      if (!progressSpinner || loggerPaused) return;
      progressMessage = message;
      progressSpinner.update(formatStatus(progressMessage));
    };
    let resumeMode: "new" | "resume" = "new";
    const resumeState = await loadScanResumeState(stateDir);
    const canPromptResume = Boolean(process.stdin.isTTY && process.stdout.isTTY && !isJsonOutput);
    if (resumeState && resumeState.status !== "complete") {
      const timestamp = resumeState.updatedAt || resumeState.startedAt;
      const lines = [
        `Interrupted scan detected (last update ${timestamp}).`,
        resumeState.lastError?.message ? `Last error: ${resumeState.lastError.message}` : null,
        "Would you like to resume it?"
      ].filter(Boolean) as string[];
      if (canPromptResume) {
        const ok = await promptYesNo(lines.join("\n"), { defaultYes: true });
        if (ok) {
          resumeMode = "resume";
          uiLogger.info(`Resuming interrupted scan from ${timestamp}.`);
        } else {
          await clearScanResumeState(stateDir);
          uiLogger.info("Cleared interrupted scan state; starting fresh.");
        }
      } else {
        resumeMode = "resume";
        uiLogger.info(`Resuming interrupted scan from ${timestamp}.`);
      }
    }

    const envSupabaseUrl = readEnvRaw("HADRIX_SUPABASE_URL");
    const envSupabasePassword = readEnvRaw("HADRIX_SUPABASE_PASSWORD");
    const envSupabaseSchema = readEnvRaw("HADRIX_SUPABASE_SCHEMA_PATH");
    const supabaseSchemaScanEnabled = isSupabaseSchemaScanEnabled();
    let supabaseConnectionString: string | null = null;
    let supabaseSchemaPath: string | null = null;
    let useSupabaseCli = false;
    const wantsSupabase = Boolean(
      options.supabase ||
        options.supabaseUrl ||
        options.supabasePassword ||
        options.supabaseSchema ||
        envSupabaseUrl ||
        envSupabasePassword ||
        envSupabaseSchema
    );
    if (!supabaseSchemaScanEnabled) {
      if (wantsSupabase) {
        uiLogger.warn(
          `Supabase schema scan is disabled. Set ${SUPABASE_SCHEMA_SCAN_FLAG}=1 to enable it.`
        );
      }
    } else if (wantsSupabase) {
      supabaseSchemaPath = options.supabaseSchema ?? envSupabaseSchema ?? null;
      if (!supabaseSchemaPath) {
        const conn = options.supabaseUrl ?? envSupabaseUrl ?? "";
        const password = options.supabasePassword ?? envSupabasePassword ?? null;
        if (conn.trim()) {
          supabaseConnectionString = buildSupabaseConnectionString(conn, password);
        } else {
          useSupabaseCli = true;
        }
      }
    } else if (process.stdin.isTTY && !isJsonOutput) {
      const dbPrompt = [
        "Would you like to also scan your database for misconfigured RLS,",
        "column privileges, public storage, and more?",
        "This is strongly recommended; most security issues for vibe coders are in",
        "database misconfigurations.",
        "All data is stored locally on your device.",
        "More info: https://cli.hadrix.ai",
        "OSS code: https://github.com/hadrix-ai/hadrix.",
        "",
        "If so, select a database provider below. If not, then skip."
      ].join("\n");
      const choice = await promptSelect(dbPrompt, ["Supabase", "Skip"], {
        defaultIndex: 1
      });
      if (choice === 0) {
	        useSupabaseCli = true;
	      }
	    }

	    const progress = statusSpinner
        ? createProgressReporter(updateStatus)
        : progressSpinner
          ? createProgressReporter(updateProgress)
          : undefined;
	    if (powerMode) {
	      uiLogger.info(
	        `Power mode enabled (OpenAI: ${POWER_LLM_MODEL_OPENAI}, Anthropic: ${POWER_LLM_MODEL_ANTHROPIC}). Power mode gives more thorough results at higher cost than default models (OpenAI: ${DEFAULT_LLM_MODEL_OPENAI}, Anthropic: ${DEFAULT_LLM_MODEL_ANTHROPIC}).`
	      );
	    }

	    try {
	      if (statusSpinner || progressSpinner) {
        scanStart = Date.now();
        statusSpinner?.start(formatStatus(statusMessage));
        progressSpinner?.start(formatStatus(progressMessage));
        elapsedTimer = setInterval(() => {
          statusSpinner?.update(formatStatus(statusMessage));
          progressSpinner?.update(formatStatus(progressMessage));
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
          uiLogger,
          appLogger: appLog,
          progress,
          debug: options.debug,
          debugLogPath: options.debugLog,
          powerMode,
          resume: resumeMode,
          supabase: supabaseSchemaPath
            ? { schemaSnapshotPath: supabaseSchemaPath }
            : supabaseConnectionString
              ? { connectionString: supabaseConnectionString }
              : useSupabaseCli
                ? { useCli: true }
                : null
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
        statusSpinner?.stop();
        progressSpinner?.stop();
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
        await runSetup({ autoYes: false, uiLogger, appLogger: appLog });
        if (statusSpinner || progressSpinner) {
          statusSpinner?.start(formatStatus(statusMessage));
          progressSpinner?.start(formatStatus(progressMessage));
          elapsedTimer = setInterval(() => {
            statusSpinner?.update(formatStatus(statusMessage));
            progressSpinner?.update(formatStatus(progressMessage));
          }, 1000);
        }
        result = await runScanOnce();
      }

      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      statusSpinner?.stop();
      progressSpinner?.stop();

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
      statusSpinner?.stop();
      progressSpinner?.stop();
      const message = err instanceof Error ? err.message : String(err);
      logCliError(uiLogger, message);
      process.exitCode = 2;
    } finally {
      await appLogger?.close();
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
  .option(
    "--power",
    `Use power LLM mode. OpenAI: ${POWER_LLM_MODEL_OPENAI}, Anthropic: ${POWER_LLM_MODEL_ANTHROPIC}. Power mode gives more thorough results at higher cost than default models (OpenAI: ${DEFAULT_LLM_MODEL_OPENAI}, Anthropic: ${DEFAULT_LLM_MODEL_ANTHROPIC})`
  )
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
    power?: boolean;
    debug?: boolean;
    debugLog?: string;
  }) => {
    const output = options.json ? "json" : "text";
    const useSpinner =
      output !== "json" &&
      process.stdout.isTTY &&
      !options.debug &&
      !options.debugLog;
    const spinner = useSpinner ? new Spinner(process.stdout) : null;
    const evalStart = Date.now();
    let statusMessage = "Running evals...";
    const deferredLogs: string[] = [];
    const powerMode = Boolean(options.power);

    const stateDir = path.join(process.cwd(), ".hadrix");
    let appLogger: AppLogger | null = null;
    try {
      appLogger = await createAppLogger({ stateDir, label: "evals" });
    } catch {
      appLogger = null;
    }
    const appLog = appLogger ?? noopLogger;
    const formatElapsed = () => formatDuration(Date.now() - evalStart);
    const formatStatus = (message: string) => `${message} (elapsed ${formatElapsed()})`;
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;
    const showElapsedInLogs =
      output !== "json" && !spinner && Boolean(options.debug || options.debugLog);
    const formatLogMessage = (message: string) => {
      if (!showElapsedInLogs) return message;
      if (message.includes("(elapsed ")) return message;
      return `${message} (elapsed ${formatElapsed()})`;
    };

    const emitUi = (message: string, uiMessage: string) => {
      if (output === "json") return;
      if (spinner) {
        if (message.startsWith("Dedupe report saved to") || message.length > 120) {
          deferredLogs.push(uiMessage);
          return;
        }
        statusMessage = message;
        spinner.update(formatStatus(statusMessage));
        return;
      }
      console.log(uiMessage);
    };
    const uiLogger: Logger = {
      info: (message, meta) => {
        appLog.info(message, meta);
        emitUi(message, formatLogMessage(message));
      },
      warn: (message, meta) => {
        appLog.warn(message, meta);
        emitUi(message, pc.yellow(formatLogMessage(message)));
      },
	      error: (message, meta) => {
	        appLog.error(message, meta);
	        emitUi(message, pc.red(formatLogMessage(message)));
	      },
	      debug: (message, meta) => appLog.debug(message, meta)
	    };
	    if (powerMode) {
	      uiLogger.info(
	        `Power mode enabled (OpenAI: ${POWER_LLM_MODEL_OPENAI}, Anthropic: ${POWER_LLM_MODEL_ANTHROPIC}). Power mode gives more thorough results at higher cost than default models (OpenAI: ${DEFAULT_LLM_MODEL_OPENAI}, Anthropic: ${DEFAULT_LLM_MODEL_ANTHROPIC}).`
	      );
	    }

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
        power: powerMode,
        debug: options.debug,
        debugLogPath,
        output,
        skipStatic: options.skipStatic,
        uiLogger,
        appLogger: appLog,
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
        uiLogger.warn(`Failed to write eval artifacts: ${message}`);
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
      logCliError(uiLogger, message);
      process.exitCode = 2;
    } finally {
      await appLogger?.close();
    }
  });

program
  .command("setup")
  .description("Install required scanners and jelly call graph analyzer")
  .option("-y, --yes", "Install without prompting")
  .action(async (options: { yes?: boolean }) => {
    const stateDir = path.join(process.cwd(), ".hadrix");
    let appLogger: AppLogger | null = null;
    try {
      appLogger = await createAppLogger({ stateDir, label: "setup" });
    } catch {
      appLogger = null;
    }
    const appLog = appLogger ?? noopLogger;
    const logUi = (level: "info" | "warn" | "error", message: string, uiMessage?: string) => {
      appLog[level](message);
      console.log(uiMessage ?? message);
    };
    const uiLogger: Logger = {
      info: (message, meta) => {
        appLog.info(message, meta);
        console.log(message);
      },
      warn: (message, meta) => logUi("warn", message, pc.yellow(message)),
      error: (message, meta) => logUi("error", message, pc.red(message)),
      debug: (message, meta) => appLog.debug(message, meta)
    };
    try {
      const results = await runSetup({
        autoYes: options.yes ?? false,
        uiLogger,
        appLogger: appLog
      });
      const failed = results.filter((result) => !result.installed && !result.optional);
      if (failed.length) {
        uiLogger.error(`Setup incomplete. Missing: ${failed.map((r) => r.tool).join(", ")}.`);
        process.exitCode = 1;
      } else {
        appLog.info("Setup complete.");
        console.log(pc.green("Setup complete."));
        process.exitCode = 0;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      uiLogger.error(`Setup failed: ${message}`);
      process.exitCode = 1;
    } finally {
      await appLogger?.close();
    }
  });

program.parse(process.argv);
