import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ProviderApiResponseError,
  ProviderRequestFailedError
} from "../../../errors/provider.errors.js";
import type { CodexExecResult } from "../codexClient.js";
import { mapCodexExecFailure } from "../codexClient.js";

const makeResult = (overrides: Partial<CodexExecResult> = {}): CodexExecResult => ({
  exitCode: 1,
  signal: null,
  stdout: "",
  stderr: "",
  lastMessage: null,
  jsonEvents: [],
  jsonErrorEvents: [],
  durationMs: 5,
  ...overrides
});

test("codex error mapping attaches retry metadata from nested error payloads", () => {
  const result = makeResult({
    jsonErrorEvents: [
      {
        type: "error",
        error: {
          message: "Too many requests",
          status: 429,
          code: "rate_limit"
        }
      }
    ]
  });

  const error = mapCodexExecFailure(result);

  assert.ok(error instanceof ProviderApiResponseError);
  assert.match(error.message, /Codex CLI exited with code 1/);
  assert.match(error.message, /Too many requests/);
  assert.equal((error as { statusCode?: number }).statusCode, 429);
  assert.equal((error as { code?: string }).code, "rate_limit");
});

test("codex error mapping preserves metadata for signal failures", () => {
  const result = makeResult({
    exitCode: null,
    signal: "SIGTERM",
    jsonErrorEvents: [
      {
        type: "fatal",
        message: "Service unavailable",
        status_code: "503",
        error_code: "overloaded"
      }
    ]
  });

  const error = mapCodexExecFailure(result);

  assert.ok(error instanceof ProviderRequestFailedError);
  assert.match(error.message, /Codex CLI terminated with signal SIGTERM/);
  assert.match(error.message, /Service unavailable/);
  assert.equal((error as { statusCode?: number }).statusCode, 503);
  assert.equal((error as { code?: string }).code, "overloaded");
});
