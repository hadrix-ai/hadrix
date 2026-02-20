import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { LLMProviderId } from "../../../config/loadConfig.js";
import { ProviderApiResponseError } from "../../../errors/provider.errors.js";
import type { ClaudeCodeExecResult } from "../claudeCodeClient.js";
import { runClaudeCodeAdapter } from "../claudeCodeClient.js";
import type { LlmAdapterInput } from "../llm.js";

const STUB_MESSAGE = "stubbed response";
const STUB_ERROR_MESSAGE = "Not logged in. Please run /login";

const buildStubScript = (message: string): string => `#!/usr/bin/env node
const args = process.argv.slice(2);

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
  const payload = {
    type: "message",
    message: { content: [{ text: ${JSON.stringify(message)} }] },
    args,
    stdin
  };
  process.stdout.write(JSON.stringify(payload) + "\\n");
})().catch((error) => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  process.stderr.write(message);
  process.exit(1);
});
`;

const buildStubShim = (): string => `#!/usr/bin/env sh
DIR=$(cd "$(dirname "$0")" && pwd)
exec node "$DIR/claude-stub.cjs" "$@"
`;

const buildErrorStubScript = (): string => `#!/usr/bin/env node
const payload = {
  type: "result",
  is_error: true,
  result: ${JSON.stringify(STUB_ERROR_MESSAGE)}
};
process.stdout.write(JSON.stringify(payload) + "\\n");
`;

const buildSubtypeErrorStubScript = (): string => `#!/usr/bin/env node
const payload = {
  type: "result",
  subtype: "error_during_execution",
  result: "Permission denied"
};
process.stdout.write(JSON.stringify(payload) + "\\n");
`;

test("claude code adapter spawns claude -p and parses json output", async () => {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "hadrix-claude-integration-"));
  try {
    const stubDir = path.join(tmpRoot, "bin");
    await mkdir(stubDir, { recursive: true });

    const stubScriptPath = path.join(stubDir, "claude-stub.cjs");
    const stubBinPath = path.join(stubDir, "claude");
    await writeFile(stubScriptPath, buildStubScript(STUB_MESSAGE), "utf8");
    await writeFile(stubBinPath, buildStubShim(), "utf8");
    await chmod(stubBinPath, 0o755);

    const env = {
      ...process.env,
      PATH: `${stubDir}${path.delimiter}${process.env.PATH ?? ""}`
    };

    const input: LlmAdapterInput = {
      provider: LLMProviderId.ClaudeCode,
      model: "claude-haiku-4-5",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" }
      ],
      temperature: 0,
      maxTokens: 128
    };

    const result = await runClaudeCodeAdapter(input, { env });
    const raw = result.raw as ClaudeCodeExecResult;
    const output = raw.jsonOutput as { args?: string[]; stdin?: string };

    assert.equal(result.text, STUB_MESSAGE);
    assert.equal(raw.assistantText, STUB_MESSAGE);
    assert.ok(Array.isArray(output.args));
    const args = output.args ?? [];
    const outputIndex = args.indexOf("--output-format");
    assert.ok(outputIndex >= 0);
    assert.equal(args[outputIndex + 1], "json");
    const promptIndex = args.indexOf("--");
    assert.ok(promptIndex >= 0);
    const promptFlagIndex = args.indexOf("-p");
    assert.ok(promptFlagIndex >= 0);
    assert.ok(promptFlagIndex < promptIndex);
    assert.equal(
      args[promptIndex + 1],
      "System:\nYou are a helpful assistant.\n\nUser:\nHello\n\nAssistant:"
    );
    assert.equal(output.stdin, "");
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test("claude code adapter treats is_error json responses as failures", async () => {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "hadrix-claude-integration-"));
  try {
    const stubDir = path.join(tmpRoot, "bin");
    await mkdir(stubDir, { recursive: true });

    const stubScriptPath = path.join(stubDir, "claude-stub.cjs");
    const stubBinPath = path.join(stubDir, "claude");
    await writeFile(stubScriptPath, buildErrorStubScript(), "utf8");
    await writeFile(stubBinPath, buildStubShim(), "utf8");
    await chmod(stubBinPath, 0o755);

    const env = {
      ...process.env,
      PATH: `${stubDir}${path.delimiter}${process.env.PATH ?? ""}`
    };

    const input: LlmAdapterInput = {
      provider: LLMProviderId.ClaudeCode,
      model: "claude-haiku-4-5",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" }
      ],
      temperature: 0,
      maxTokens: 128
    };

    await assert.rejects(
      () => runClaudeCodeAdapter(input, { env }),
      (error) => {
        assert.ok(error instanceof ProviderApiResponseError);
        assert.match(error.message, /not logged in/i);
        return true;
      }
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test("claude code adapter treats error subtype json responses as failures", async () => {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "hadrix-claude-integration-"));
  try {
    const stubDir = path.join(tmpRoot, "bin");
    await mkdir(stubDir, { recursive: true });

    const stubScriptPath = path.join(stubDir, "claude-stub.cjs");
    const stubBinPath = path.join(stubDir, "claude");
    await writeFile(stubScriptPath, buildSubtypeErrorStubScript(), "utf8");
    await writeFile(stubBinPath, buildStubShim(), "utf8");
    await chmod(stubBinPath, 0o755);

    const env = {
      ...process.env,
      PATH: `${stubDir}${path.delimiter}${process.env.PATH ?? ""}`
    };

    const input: LlmAdapterInput = {
      provider: LLMProviderId.ClaudeCode,
      model: "claude-haiku-4-5",
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello" }
      ],
      temperature: 0,
      maxTokens: 128
    };

    await assert.rejects(
      () => runClaudeCodeAdapter(input, { env }),
      (error) => {
        assert.ok(error instanceof ProviderApiResponseError);
        assert.match(error.message, /permission denied/i);
        return true;
      }
    );
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});
