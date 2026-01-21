#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { runScan } from "./scan/runScan.js";
import { formatFindingsText, formatScanResultJson } from "./report/formatters.js";
import { runSetup } from "./setup/runSetup.js";

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

program
  .name("hadrix")
  .description("Hadrix local security scan")
  .version("0.1.0");

program
  .command("scan [target]")
  .description("Scan a project directory")
  .option("-c, --config <path>", "Path to hadrix.config.json")
  .option("-f, --format <format>", "Output format (text|json)")
  .option("--json", "Shortcut for --format json")
  .action(async (target: string | undefined, options: { config?: string; format?: string; json?: boolean }) => {
    const projectRoot = path.resolve(process.cwd(), target ?? ".");
    const format = options.json ? "json" : options.format ?? "text";
    const useSpinner = format !== "json" && process.stderr.isTTY;
    const spinner = useSpinner ? new Spinner(process.stderr) : null;
    const scanStart = Date.now();
    let statusMessage = "Running scan...";

    const formatElapsed = () => formatDuration(Date.now() - scanStart);
    const formatStatus = (message: string) => `${message} (elapsed ${formatElapsed()})`;
    let elapsedTimer: ReturnType<typeof setInterval> | null = null;

    try {
      if (spinner) {
        spinner.start(formatStatus(statusMessage));
        elapsedTimer = setInterval(() => {
          spinner.update(formatStatus(statusMessage));
        }, 1000);
      }
      const result = await runScan({
        projectRoot,
        configPath: options.config,
        logger: (message) => {
          if (format === "json") return;
          if (spinner) {
            statusMessage = message;
            spinner.update(formatStatus(statusMessage));
            return;
          }
          console.error(message);
        }
      });
      if (elapsedTimer) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
      spinner?.stop();

      if (format === "json") {
        console.log(formatScanResultJson(result));
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
      const failed = results.filter((result) => !result.installed);
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
