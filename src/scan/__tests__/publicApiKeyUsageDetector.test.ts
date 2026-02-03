import assert from "node:assert/strict";
import { test } from "node:test";
import { detectPublicApiKeySignals } from "../signals/detectors/publicApiKeyUsage.js";

test("detects anon key used as bearer token", () => {
  const content = [
    'const bearer = toggleEnabled("flag") ? env.supabaseAnonKey : accessToken;',
    'fetch(url, { headers: { authorization: `Bearer ${bearer}` }});'
  ].join("\n");
  const hits = detectPublicApiKeySignals(content);
  const ids = hits.map((hit) => hit.id);
  assert.ok(ids.includes("public_api_key_bearer"));
  assert.ok(ids.includes("public_api_key_usage"));
});

test("detects anon key usage in client initialization", () => {
  const content = 'const sb = createClient(env.supabaseUrl, env.supabaseAnonKey);';
  const hits = detectPublicApiKeySignals(content);
  const ids = hits.map((hit) => hit.id);
  assert.ok(ids.includes("public_api_key_usage"));
  assert.ok(!ids.includes("public_api_key_bearer"));
});

test("ignores bearer header without anon key", () => {
  const content = [
    'const token = session?.access_token ?? "";',
    'fetch(url, { headers: { Authorization: `Bearer ${token}` }});'
  ].join("\n");
  const hits = detectPublicApiKeySignals(content);
  const ids = hits.map((hit) => hit.id);
  assert.ok(!ids.includes("public_api_key_usage"));
  assert.ok(!ids.includes("public_api_key_bearer"));
});
