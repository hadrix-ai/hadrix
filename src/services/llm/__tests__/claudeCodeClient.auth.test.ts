import assert from "node:assert/strict";
import { test } from "node:test";
import { __test__ } from "../claudeCodeClient.js";

const { isClaudeCodeLoginRequiredOutput } = __test__;

test("claude code auth probe: detects not logged in in stdout", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("Not logged in. Please run /login.", ""), true);
});

test("claude code auth probe: detects not signed in in stdout", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("Not signed in. Please run /login.", ""), true);
});

test("claude code auth probe: detects not authenticated variants", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("Not authenticated. Login required.", ""), true);
  assert.equal(isClaudeCodeLoginRequiredOutput("", "Error: login required to continue."), true);
});

test("claude code auth probe: detects authentication required wording", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("Authentication required to continue.", ""), true);
});

test("claude code auth probe: detects login marker in stderr", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("", "Error: run /login to continue."), true);
});

test("claude code auth probe: detects login to continue phrasing", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("Login to continue.", ""), true);
});

test("claude code auth probe: detects unauthorized variants", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("Unauthorized.", ""), true);
  assert.equal(isClaudeCodeLoginRequiredOutput("Not authorized to continue.", ""), true);
});

test("claude code auth probe: detects log in phrasing", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("Please log in to continue.", ""), true);
});

test("claude code auth probe: detects sign-in variants", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("Sign-in required to continue.", ""), true);
  assert.equal(isClaudeCodeLoginRequiredOutput("Signin required to continue.", ""), true);
});

test("claude code auth probe: ignores logged in output", () => {
  assert.equal(isClaudeCodeLoginRequiredOutput("Logged in as dev@example.com", ""), false);
});

test("claude code auth probe: detects middle-dot login output", () => {
  assert.equal(
    isClaudeCodeLoginRequiredOutput("Not logged in \u00b7 Please run /login", ""),
    true
  );
});
