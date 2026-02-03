import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPublicEnvSecretUsage } from "../signals/detectors/secretExposure.js";

test("detects public env service role key usage", () => {
  const content = `const key = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? "";`;
  const hit = detectPublicEnvSecretUsage(content);
  assert.ok(hit);
  assert.equal(hit?.name, "NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY");
});

test("detects import.meta public secret usage", () => {
  const content = `const key = import.meta.env.VITE_SERVICE_ROLE_SECRET;`;
  const hit = detectPublicEnvSecretUsage(content);
  assert.ok(hit);
});

test("ignores public anon keys", () => {
  const content = `const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;`;
  const hit = detectPublicEnvSecretUsage(content);
  assert.equal(hit, null);
});

test("ignores non-public secret env vars", () => {
  const content = `const key = process.env.SUPABASE_SERVICE_ROLE_KEY;`;
  const hit = detectPublicEnvSecretUsage(content);
  assert.equal(hit, null);
});
