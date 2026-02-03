import assert from "node:assert/strict";
import { test } from "node:test";
import { REPOSITORY_SCAN_RULES } from "../catalog/repositoryRuleCatalog.js";
import { parseChunkUnderstandingRecord, resolveCandidateRuleIds } from "../repositoryScanner.js";

const rulesById = new Map(REPOSITORY_SCAN_RULES.map((rule) => [rule.id, rule]));
const fallback = { chunkId: "fallback", filePath: "src/unknown.ts" };

const selectRules = (record: Record<string, unknown>) => {
  const understanding = parseChunkUnderstandingRecord(record, fallback);
  return resolveCandidateRuleIds({
    understanding,
    familyMapping: null,
    rulesById,
    fallbackRuleIds: []
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
