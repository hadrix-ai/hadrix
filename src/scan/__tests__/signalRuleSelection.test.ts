import assert from "node:assert/strict";
import { test } from "node:test";
import { REPOSITORY_SCAN_RULES } from "../catalog/repositoryRuleCatalog.js";
import { parseChunkUnderstandingRecord, resolveCandidateRuleIds } from "../repositoryScanner.js";

const rulesById = new Map(REPOSITORY_SCAN_RULES.map((rule) => [rule.id, rule]));
const fallback = { chunkId: "fallback", filePath: "src/unknown.ts" };

const selectRules = (
  record: Record<string, unknown>,
  caps?: {
    maxRulesPerChunkDefault?: number;
    maxRulesPerChunkHighRisk?: number;
    minRulesPerChunk?: number;
  }
) => {
  const understanding = parseChunkUnderstandingRecord(record, fallback);
  return resolveCandidateRuleIds({
    understanding,
    familyMapping: null,
    rulesById,
    fallbackRuleIds: [],
    ...caps
  });
};

test("signal routing: webhook handler selects webhook signature rule", () => {
  const selection = selectRules({
    chunk_id: "chunk-webhook",
    file_path: "src/webhooks.ts",
    confidence: 0.6,
    signals: [
      {
        id: "webhook_handler",
        evidence: "handles Stripe webhook payload",
        confidence: 0.9
      }
    ]
  });

  assert.ok(selection.ruleIds.includes("missing_webhook_signature"));
  assert.ok(!selection.ruleIds.includes("sql_injection"));
});

test("signal routing: raw_sql_sink + untrusted_input_present selects sql_injection", () => {
  const selection = selectRules({
    chunk_id: "chunk-sql",
    file_path: "src/db/query.ts",
    confidence: 0.7,
    signals: [
      {
        id: "raw_sql_sink",
        evidence: "executes SQL string",
        confidence: 0.9
      },
      {
        id: "untrusted_input_present",
        evidence: "uses request params",
        confidence: 0.7
      }
    ]
  });

  assert.ok(selection.ruleIds.includes("sql_injection"));
});

test("signal routing: empty signals fall back to role/baseline", () => {
  const selection = selectRules({
    chunk_id: "chunk-empty",
    file_path: "src/unknown.ts",
    confidence: 0.2
  });

  assert.notEqual(selection.strategy, "signals_primary");
  assert.ok(selection.ruleIds.length > 0);
  assert.ok(selection.ruleIds.length <= 5);
});

test("signal routing: requiredAllSignals gating blocks unrelated rules", () => {
  const selection = selectRules({
    chunk_id: "chunk-no-webhook",
    file_path: "src/db/exec.ts",
    confidence: 0.6,
    signals: [
      {
        id: "raw_sql_sink",
        evidence: "executes raw SQL",
        confidence: 0.8
      }
    ]
  });

  assert.ok(!selection.ruleIds.includes("missing_webhook_signature"));
});

test("candidate caps: default cap=5, high risk cap=10", () => {
  const baseCaps = {
    maxRulesPerChunkDefault: 5,
    maxRulesPerChunkHighRisk: 10,
    minRulesPerChunk: 3
  };

  const nonHighRisk = selectRules(
    {
      chunk_id: "chunk-non-high-risk",
      file_path: "src/service/api.ts",
      confidence: 0.7,
      exposure: "internal",
      signals: [
        { id: "authn_present", evidence: "checks session", confidence: 0.8 },
        { id: "authz_present", evidence: "role check", confidence: 0.7 },
        { id: "http_request_sink", evidence: "fetch call", confidence: 0.7 },
        { id: "cors_permissive_or_unknown", evidence: "cors wildcard", confidence: 0.6 },
        { id: "rate_limit_missing_or_unknown", evidence: "no rate limit", confidence: 0.6 },
        { id: "logs_sensitive", evidence: "logs tokens", confidence: 0.6 },
        { id: "secrets_access", evidence: "reads secret", confidence: 0.6 }
      ]
    },
    baseCaps
  );

  assert.equal(nonHighRisk.capUsed, 5);
  assert.ok(nonHighRisk.ruleIds.length <= 5);

  const highRisk = selectRules(
    {
      chunk_id: "chunk-high-risk",
      file_path: "src/service/public.ts",
      confidence: 0.8,
      exposure: "public",
      signals: [
        { id: "exec_sink", evidence: "execs command", confidence: 0.9 },
        { id: "raw_sql_sink", evidence: "raw sql", confidence: 0.9 },
        { id: "untrusted_input_present", evidence: "request params", confidence: 0.8 },
        { id: "authn_missing_or_unknown", evidence: "no auth guard", confidence: 0.7 },
        { id: "authz_missing_or_unknown", evidence: "no ownership check", confidence: 0.7 },
        { id: "http_request_sink", evidence: "fetch call", confidence: 0.7 },
        { id: "file_write_sink", evidence: "writes file", confidence: 0.7 },
        { id: "template_render", evidence: "renders template", confidence: 0.7 },
        { id: "logs_sensitive", evidence: "logs secrets", confidence: 0.6 },
        { id: "secrets_access", evidence: "reads secrets", confidence: 0.6 }
      ]
    },
    baseCaps
  );

  assert.equal(highRisk.capUsed, 10);
  assert.ok(highRisk.ruleIds.length <= 10);
  assert.ok(highRisk.ruleIds.length > 5);
});
