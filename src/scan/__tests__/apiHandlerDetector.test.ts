import assert from "node:assert/strict";
import { test } from "node:test";
import { detectApiHandler } from "../signals/detectors/apiHandler.js";

test("detects Next.js app router handlers", () => {
  const content = 'export async function POST(req: Request) { return new Response("ok"); }';
  const evidence = detectApiHandler(content);
  assert.ok(evidence);
});

test("detects Express router handlers", () => {
  const content = 'router.post("/login", async (req, res) => res.json({ ok: true }));';
  const evidence = detectApiHandler(content);
  assert.ok(evidence);
});

test("ignores non-handler exports", () => {
  const content = 'export async function helper() { return true; }';
  const evidence = detectApiHandler(content);
  assert.equal(evidence, null);
});
