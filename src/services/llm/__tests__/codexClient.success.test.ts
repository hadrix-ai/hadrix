import assert from "node:assert/strict";
import { test } from "node:test";
import { LLMProviderId } from "../../../config/loadConfig.js";
import type { LlmAdapterInput } from "../llm.js";
import type { CodexExecOptions, CodexExecResult } from "../codexClient.js";
import { __test__ } from "../codexClient.js";

const makeResult = (overrides: Partial<CodexExecResult> = {}): CodexExecResult => ({
  exitCode: 0,
  signal: null,
  stdout: "",
  stderr: "",
  lastMessage: "ok",
  jsonEvents: [],
  jsonErrorEvents: [],
  durationMs: 5,
  ...overrides
});

test("codex adapter returns last message text and passes prompt to exec", async () => {
  let seenArgs: string[] | undefined;
  let seenOptions: CodexExecOptions | undefined;
  const execResult = makeResult({ lastMessage: "Hello from Codex\n" });
  const execRunner = async (
    args: string[],
    options?: CodexExecOptions
  ): Promise<CodexExecResult> => {
    seenArgs = args;
    seenOptions = options;
    return execResult;
  };

  const input: LlmAdapterInput = {
    provider: LLMProviderId.Codex,
    model: "gpt-5.1-codex-mini",
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Hello" }
    ],
    temperature: 0,
    maxTokens: 200
  };

  const result = await __test__.runCodexAdapterWithExec(input, { cwd: "/tmp" }, execRunner);

  assert.equal(result.text, "Hello from Codex\n");
  assert.equal(result.raw, execResult);
  assert.deepStrictEqual(seenArgs, [
    "-c",
    'model_reasoning_effort="high"',
    "--model",
    "gpt-5.1-codex-mini",
    "--ephemeral",
    "--skip-git-repo-check"
  ]);
  assert.equal(seenOptions?.cwd, "/tmp");
  assert.equal(
    seenOptions?.stdin,
    "System:\nYou are a helpful assistant.\n\nUser:\nHello\n\nAssistant:"
  );
});
