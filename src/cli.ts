#!/usr/bin/env node
import path from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Command } from "commander";
import pc from "picocolors";
import { runScan } from "./scan/runScan.js";
import { formatFindingsText, formatScanResultCoreJson, formatScanResultJson } from "./report/formatters.js";
import { runSetup } from "./setup/runSetup.js";
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

async function promptYesNo(question: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`${question} (y/N) `);
  rl.close();
  return ["y", "yes"].includes(answer.trim().toLowerCase());
}

function isMissingScannersError(message: string): boolean {
  return message.includes("Missing required static scanners:");
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
  .option("--skip-jelly-anchors", "Skip jelly call graph anchors")
  .option("--existing-findings <path>", "Existing findings JSON array or file path")
  .option("--repo-full-name <name>", "Repository full name for metadata")
  .option("--repo-id <id>", "Repository id for metadata")
  .option("--commit-sha <sha>", "Commit SHA for metadata")
  .action(async (
    target: string | undefined,
    options: {
      config?: string;
      format?: string;
      json?: boolean;
      repoPath?: string;
      repoPathInference?: boolean;
      skipStatic?: boolean;
      skipJellyAnchors?: boolean;
      existingFindings?: string;
      repoFullName?: string;
      repoId?: string;
      commitSha?: string;
    }
  ) => {
    const projectRoot = path.resolve(process.cwd(), target ?? ".");
    const format = options.json ? "json" : options.format ?? "text";
    const isJsonOutput = format === "json" || format === "core-json";
    const useSpinner = !isJsonOutput && process.stderr.isTTY;
    const spinner = useSpinner ? new Spinner(process.stderr) : null;
    const scanStart = Date.now();
    let statusMessage = "Running scan...";

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
          skipJellyAnchors: options.skipJellyAnchors ?? false,
          existingFindings,
          repoFullName: options.repoFullName,
          repositoryId: options.repoId,
          commitSha: options.commitSha,
          logger
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
        const ok = await promptYesNo("Static scanners missing. Run 'hadrix setup' now?");
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
  .command("setup")
  .description("Install required static scanners")
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
