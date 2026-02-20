import assert from "node:assert/strict";
import { test } from "node:test";
import { buildClaudeCodePromptInput, parseClaudeCodeJsonOutput } from "../claudeCodeClient.js";

test("claude code parser extracts text from nested message content", () => {
  const payload = JSON.stringify({
    type: "message",
    message: {
      content: [{ text: "Hello" }, { text: " world" }]
    }
  });

  const result = parseClaudeCodeJsonOutput(payload);

  assert.equal(result.text, "Hello world");
  assert.deepStrictEqual(result.raw, {
    type: "message",
    message: {
      content: [{ text: "Hello" }, { text: " world" }]
    }
  });
});

test("claude code parser merges jsonl delta fragments", () => {
  const payload = [
    JSON.stringify({ type: "message", delta: "Hello" }),
    JSON.stringify({ type: "message", delta: " world" })
  ].join("\n");

  const result = parseClaudeCodeJsonOutput(payload);

  assert.equal(result.text, "Hello world");
  assert.deepStrictEqual(result.raw, [
    { type: "message", delta: "Hello" },
    { type: "message", delta: " world" }
  ]);
});

test("claude code parser recovers json embedded in extra text", () => {
  const payload = "event: data {\"text\":\"Hello from Claude\"} trailing";

  const result = parseClaudeCodeJsonOutput(payload);

  assert.equal(result.text, "Hello from Claude");
  assert.deepStrictEqual(result.raw, { text: "Hello from Claude" });
});

test("claude code parser extracts text from output_text field", () => {
  const payload = JSON.stringify({ output_text: "Pong" });

  const result = parseClaudeCodeJsonOutput(payload);

  assert.equal(result.text, "Pong");
  assert.deepStrictEqual(result.raw, { output_text: "Pong" });
});

test("claude code prompt input uses args for standard prompts", () => {
  const result = buildClaudeCodePromptInput("Hello Claude");

  assert.deepStrictEqual(result.args, ["-p", "--input-format", "text", "--", "Hello Claude"]);
  assert.equal(result.stdin, undefined);
});

test("claude code prompt input uses stdin when prompt contains null bytes", () => {
  const prompt = "Hello\u0000Claude";
  const result = buildClaudeCodePromptInput(prompt);

  assert.deepStrictEqual(result.args, ["-p", "--input-format", "text"]);
  assert.equal(result.stdin, prompt);
});

test("claude code prompt input uses stdin for large prompts", () => {
  const prompt = "a".repeat(100_000);
  const result = buildClaudeCodePromptInput(prompt);

  assert.deepStrictEqual(result.args, ["-p", "--input-format", "text"]);
  assert.equal(result.stdin, prompt);
});
