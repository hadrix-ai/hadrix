import assert from "node:assert/strict";
import { test } from "node:test";
import { LLMProviderId, loadConfig } from "../loadConfig.js";
import { ConfigMissingApiKeyError } from "../../errors/config.errors.js";

const ENV_KEYS = [
  "HADRIX_PROVIDER",
  "HADRIX_LLM_PROVIDER",
  "HADRIX_API_KEY",
  "HADRIX_API_BASE",
  "HADRIX_LLM_BASE",
  "HADRIX_LLM_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "OPENAI_API_BASE",
  "ANTHROPIC_API_BASE"
];

const PROJECT_ROOT = process.cwd();
const CONFIG_PATH = ".codex-test-config.json";

const applyEnv = (t: { after: (fn: () => void) => void }, env: Record<string, string | undefined>) => {
  const snapshot = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));

  for (const key of ENV_KEYS) {
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      const value = env[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    } else {
      delete process.env[key];
    }
  }

  t.after(() => {
    for (const key of ENV_KEYS) {
      const value = snapshot.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
};

test("provider normalization: claude alias maps to anthropic", async (t) => {
  applyEnv(t, {
    HADRIX_PROVIDER: "ClAuDe",
    HADRIX_API_KEY: "test-key"
  });

  const cfg = await loadConfig({ projectRoot: PROJECT_ROOT, configPath: CONFIG_PATH });

  assert.equal(cfg.api.provider, LLMProviderId.Anthropic);
  assert.equal(cfg.llm.provider, LLMProviderId.Anthropic);
});

test("provider normalization: openai-codex alias maps to codex", async (t) => {
  applyEnv(t, {
    HADRIX_PROVIDER: "openai-codex",
    HADRIX_API_BASE: "https://codex.local"
  });

  const cfg = await loadConfig({ projectRoot: PROJECT_ROOT, configPath: CONFIG_PATH });

  assert.equal(cfg.api.provider, LLMProviderId.Codex);
  assert.equal(cfg.llm.provider, LLMProviderId.Codex);
  assert.equal(cfg.api.baseUrl, "https://codex.local");
});

test("provider normalization: unknown providers fall back to openai", async (t) => {
  applyEnv(t, {
    HADRIX_PROVIDER: "mystery",
    HADRIX_API_KEY: "test-key"
  });

  const cfg = await loadConfig({ projectRoot: PROJECT_ROOT, configPath: CONFIG_PATH });

  assert.equal(cfg.api.provider, LLMProviderId.OpenAI);
  assert.equal(cfg.llm.provider, LLMProviderId.OpenAI);
});

test("provider normalization: llm alias can diverge from api provider", async (t) => {
  applyEnv(t, {
    HADRIX_PROVIDER: "openai",
    HADRIX_LLM_PROVIDER: "openai-codex",
    HADRIX_API_KEY: "test-key",
    HADRIX_LLM_BASE: "https://codex-llm.local"
  });

  const cfg = await loadConfig({ projectRoot: PROJECT_ROOT, configPath: CONFIG_PATH });

  assert.equal(cfg.api.provider, LLMProviderId.OpenAI);
  assert.equal(cfg.llm.provider, LLMProviderId.Codex);
  assert.equal(cfg.llm.baseUrl, "https://codex-llm.local");
});

test("provider api key requirement: openai missing key throws", async (t) => {
  applyEnv(t, {
    HADRIX_PROVIDER: "openai"
  });

  await assert.rejects(
    loadConfig({ projectRoot: PROJECT_ROOT, configPath: CONFIG_PATH }),
    (err) => err instanceof ConfigMissingApiKeyError
  );
});

test("provider api key requirement: anthropic missing key throws", async (t) => {
  applyEnv(t, {
    HADRIX_PROVIDER: "anthropic"
  });

  await assert.rejects(
    loadConfig({ projectRoot: PROJECT_ROOT, configPath: CONFIG_PATH }),
    (err) => err instanceof ConfigMissingApiKeyError
  );
});

test("provider api key requirement: codex does not require key", async (t) => {
  applyEnv(t, {
    HADRIX_PROVIDER: "codex",
    HADRIX_API_BASE: "https://codex.local"
  });

  const cfg = await loadConfig({ projectRoot: PROJECT_ROOT, configPath: CONFIG_PATH });

  assert.equal(cfg.api.provider, LLMProviderId.Codex);
  assert.equal(cfg.llm.provider, LLMProviderId.Codex);
  assert.equal(cfg.api.apiKey, "");
});

test("provider defaults: codex resolves base URL and endpoint without explicit base env", async (t) => {
  applyEnv(t, {
    HADRIX_PROVIDER: "codex"
  });

  const cfg = await loadConfig({ projectRoot: PROJECT_ROOT, configPath: CONFIG_PATH });

  assert.equal(cfg.api.provider, LLMProviderId.Codex);
  assert.equal(cfg.llm.provider, LLMProviderId.Codex);
  assert.equal(cfg.api.baseUrl, "https://api.openai.com");
  assert.equal(cfg.llm.baseUrl, "https://api.openai.com");
  assert.equal(cfg.llm.endpoint, "https://api.openai.com/v1/chat/completions");
});
