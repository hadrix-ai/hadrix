import assert from "node:assert/strict";
import { test } from "node:test";
import { detectDebugAuthLeakSignals } from "../signals/detectors/debugAuthLeak.js";

function signalIds(content: string): string[] {
  return detectDebugAuthLeakSignals(content).map((hit) => hit.id);
}

test("detects debug response leaking headers + env", () => {
  const content = `
    export function debugConfig(req, res) {
      res.json({
        headers: req.headers,
        env: { jwtSecret: process.env.JWT_SECRET ?? "" }
      });
    }
  `;
  const ids = signalIds(content);
  assert.ok(ids.includes("logs_sensitive"));
});

test("detects headers leaked in response without env", () => {
  const content = `
    app.get("/debug", (req, res) => {
      return res.json({ headers: req.headers });
    });
  `;
  const ids = signalIds(content);
  assert.ok(ids.includes("logs_sensitive"));
  assert.ok(ids.includes("debug_endpoint"));
});

test("ignores header/env reads not included in response", () => {
  const content = `
    export async function handler(req, res) {
      const token = req.headers.authorization ?? "";
      const secret = process.env.JWT_SECRET ?? "";
      return res.json({ ok: true });
    }
  `;
  const ids = signalIds(content);
  assert.equal(ids.length, 0);
});
