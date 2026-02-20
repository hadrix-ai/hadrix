import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProviderApiResponseError,
  ProviderRequestFailedError
} from "../../../errors/provider.errors.js";
import type { ClaudeCodeExecResult } from "../claudeCodeClient.js";
import { mapClaudeCodeExecFailure, parseClaudeCodeJsonOutput } from "../claudeCodeClient.js";

const makeResult = (overrides: Partial<ClaudeCodeExecResult> = {}): ClaudeCodeExecResult => ({
  exitCode: 1,
  signal: null,
  stdout: "",
  stderr: "",
  assistantText: null,
  jsonOutput: null,
  durationMs: 5,
  ...overrides
});

test("claude code error mapping attaches retry metadata from nested error payloads", () => {
  const result = makeResult({
    jsonOutput: {
      type: "error",
      error: {
        message: "Too many requests",
        status: 429,
        code: "rate_limit"
      }
    }
  });

  const error = mapClaudeCodeExecFailure(result);

  assert.ok(error instanceof ProviderApiResponseError);
  assert.match(error.message, /Claude Code CLI exited with code 1/);
  assert.match(error.message, /Too many requests/);
  assert.equal((error as { statusCode?: number }).statusCode, 429);
  assert.equal((error as { code?: string }).code, "rate_limit");
});

test("claude code error mapping preserves metadata for signal failures", () => {
  const result = makeResult({
    exitCode: null,
    signal: "SIGTERM",
    jsonOutput: {
      type: "fatal",
      message: "Service unavailable",
      status_code: "503",
      error_code: "overloaded"
    }
  });

  const error = mapClaudeCodeExecFailure(result);

  assert.ok(error instanceof ProviderRequestFailedError);
  assert.match(error.message, /Claude Code CLI terminated with signal SIGTERM/);
  assert.match(error.message, /Service unavailable/);
  assert.equal((error as { statusCode?: number }).statusCode, 503);
  assert.equal((error as { code?: string }).code, "overloaded");
});

test("claude code parser ignores error payload text", () => {
  const payload = JSON.stringify({
    type: "error",
    error: { message: "Not logged in" },
    text: "Should not surface"
  });

  const result = parseClaudeCodeJsonOutput(payload);

  assert.equal(result.text, null);
  assert.deepStrictEqual(result.raw, {
    type: "error",
    error: { message: "Not logged in" },
    text: "Should not surface"
  });
});
