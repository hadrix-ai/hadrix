import assert from "node:assert/strict";
import { test } from "node:test";
import { REPOSITORY_SCAN_RULES } from "../catalog/repositoryRuleCatalog.js";
import {
  buildRepositoryRuleBatchSystemPrompt,
  buildRepositoryRuleSystemPrompt,
  formatRuleCardCompact,
  formatRuleCardFull
} from "../prompts/repositoryPrompts.js";

test("compact rule formatting reduces prompt size", () => {
  const rule = REPOSITORY_SCAN_RULES.find((entry) => (entry.guidance ?? []).length > 0)
    ?? REPOSITORY_SCAN_RULES[0];
  const full = formatRuleCardFull(rule);
  const compact = formatRuleCardCompact(rule);

  assert.ok(compact.length < full.length);
});

test("rule-scoped prompts use short base and omit discovery text", () => {
  const rule = REPOSITORY_SCAN_RULES[0];
  const prompt = buildRepositoryRuleSystemPrompt(rule);

  assert.ok(prompt.includes("SECURITY HEADER"));
  assert.ok(!prompt.includes("Explicitly look for:"));
  assert.ok(!prompt.includes("identify NEW, high-impact vulnerabilities"));
});

test("rule-batch prompts use short base and omit discovery text", () => {
  const prompt = buildRepositoryRuleBatchSystemPrompt(REPOSITORY_SCAN_RULES.slice(0, 2));

  assert.ok(prompt.includes("SECURITY HEADER"));
  assert.ok(!prompt.includes("Explicitly look for:"));
  assert.ok(!prompt.includes("identify NEW, high-impact vulnerabilities"));
});
