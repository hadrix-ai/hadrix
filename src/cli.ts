#!/usr/bin/env node
import path from "node:path";
import { Command } from "commander";
import pc from "picocolors";
import { runScan } from "./scan/runScan.js";
import { formatFindingsText, formatScanResultJson } from "./report/formatters.js";

const program = new Command();

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

    try {
      const result = await runScan({
        projectRoot,
        configPath: options.config,
        logger: (message) => {
          if (format !== "json") {
            console.error(message);
          }
        }
      });

      if (format === "json") {
        console.log(formatScanResultJson(result));
      } else {
        console.log(formatFindingsText(result.findings));
      }

      process.exitCode = result.findings.length ? 1 : 0;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(pc.red(`Error: ${message}`));
      process.exitCode = 2;
    }
  });

program.parse(process.argv);
