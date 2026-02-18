import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { LLMProviderId } from "../../../config/loadConfig.js";
import type { CodexExecResult } from "../codexClient.js";
import { runCodexAdapter } from "../codexClient.js";
import type { LlmAdapterInput } from "../llm.js";

const STUB_MESSAGE = "stubbed response";

const buildStubScript = (message: string): string => `#!/usr/bin/env node
const fs = require("node:fs/promises");
const path = require("node:path");

const args = process.argv.slice(2);
const execIndex = args.indexOf("exec");
if (execIndex !== 0) {
  process.stderr.write(JSON.stringify({ type: "error", message: "Missing exec subcommand", args }) + "\\n");
  process.exit(2);
}

const execArgs = args.slice(1);
const outputFlag = "--output-last-message";
let outputPath = null;
for (let i = 0; i < execArgs.length; i += 1) {
  const value = execArgs[i];
  if (value === outputFlag) {
    outputPath = execArgs[i + 1] || null;
    break;
  }
  if (value.startsWith(outputFlag + "=")) {
    outputPath = value.slice(outputFlag.length + 1);
    break;
  }
}
if (!outputPath) {
  process.stderr.write(JSON.stringify({ type: "error", message: "Missing output path", args: execArgs }) + "\\n");
  process.exit(3);
}

const readStdin = () =>
  new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });

(async () => {
  const stdin = await readStdin();
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, ${JSON.stringify(message)}, "utf8");
  const event = { type: "info", args: execArgs, stdin };
  process.stdout.write(JSON.stringify(event) + "\\n");
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  process.stderr.write(JSON.stringify({ type: "error", message }) + "\\n");
  process.exit(1);
});
`;

const buildStubShim = (): string => `#!/usr/bin/env sh
DIR=$(cd "$(dirname "$0")" && pwd)
exec node "$DIR/codex-stub.cjs" "$@"
`;

test("codex adapter spawns codex exec and reads output-last-message", async () => {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "hadrix-codex-integration-"));
  try {
    const stubDir = path.join(tmpRoot, "bin");
    await mkdir(stubDir, { recursive: true });

    const stubScriptPath = path.join(stubDir, "codex-stub.cjs");
    const stubBinPath = path.join(stubDir, "codex");
    await writeFile(stubScriptPath, buildStubScript(STUB_MESSAGE), "utf8");
    await writeFile(stubBinPath, buildStubShim(), "utf8");
    await chmod(stubBinPath, 0o755);

    const env = {
      ...process.env,
      PATH: `${stubDir}${path.delimiter}${process.env.PATH ?? ""}`
    };

    const input: LlmAdapterInput = {
      provider: LLMProviderId.Codex,
      model: "gpt-5.1-codex-mini",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" }
      ],
      temperature: 0,
      maxTokens: 128
    };

    const result = await runCodexAdapter(input, { env });
    const raw = result.raw as CodexExecResult;
    const event = raw.jsonEvents[0] as { args?: string[]; stdin?: string };

    assert.equal(result.text, STUB_MESSAGE);
    assert.equal(raw.lastMessage, STUB_MESSAGE);
    assert.equal(raw.jsonEvents.length, 1);
    assert.ok(Array.isArray(event.args));
    assert.ok(event.args?.includes("--json"));
    assert.ok(event.args?.includes("--output-last-message"));
    assert.equal(
      event.stdin,
      "System:\nYou are a helpful assistant.\n\nUser:\nHello\n\nAssistant:"
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
