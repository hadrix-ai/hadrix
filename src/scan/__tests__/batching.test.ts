import assert from "node:assert/strict";
import { test } from "node:test";
import type { RepositoryFileSample } from "../../types.js";
import {
  buildMappingBatches,
  chunkRuleIds,
  resolveRuleCluster,
  runWithCircuitBreaker
} from "../repositoryScanner.js";

const makeFile = (
  path: string,
  content: string,
  chunkIndex: number,
  overlapGroupId?: string
): RepositoryFileSample => ({
  path,
  content,
  startLine: chunkIndex + 1,
  endLine: chunkIndex + 1,
  chunkIndex,
  overlapGroupId
});

test("buildMappingBatches groups by overlapGroupId and file_path", () => {
  const files: RepositoryFileSample[] = [
    makeFile("src/a.ts", "aaa", 0, "g1"),
    makeFile("src/a.ts", "bbb", 1, "g1"),
    makeFile("src/b.ts", "ccc", 0),
    makeFile("src/b.ts", "ddd", 1),
    makeFile("", "eee", 0)
  ];

  const batches = buildMappingBatches(files, {
    basePromptTokens: 0,
    maxPromptTokens: 10000,
    minBatchSize: 1,
    maxBatchChunks: 8
  });

  assert.equal(batches.length, 3);
  const keys = batches.map((batch) =>
    batch.map((file) =>
      file.overlapGroupId
        ? `overlap:${file.overlapGroupId}`
        : file.path
          ? `file:${file.path}`
          : "misc"
    )
  );

  assert.deepStrictEqual(keys[0], ["overlap:g1", "overlap:g1"]);
  assert.deepStrictEqual(keys[1], ["file:src/b.ts", "file:src/b.ts"]);
  assert.deepStrictEqual(keys[2], ["misc"]);
});

test("buildMappingBatches respects token budget", () => {
  const files: RepositoryFileSample[] = [
    makeFile("src/a.ts", "aaa", 0, "g1"),
    makeFile("src/a.ts", "bbb", 1, "g1")
  ];

  const batches = buildMappingBatches(files, {
    basePromptTokens: 0,
    maxPromptTokens: 1,
    minBatchSize: 1,
    maxBatchChunks: 8
  });

  assert.ok(batches.every((batch) => batch.length === 1));
});

test("chunkRuleIds groups by cluster and never mixes clusters", () => {
  const ruleIds = [
    "missing_authentication",
    "sql_injection",
    "missing_webhook_signature",
    "frontend_secret_exposure",
    "missing_timeout"
  ];

  const batches = chunkRuleIds(ruleIds, 3);

  for (const batch of batches) {
    const cluster = resolveRuleCluster(batch[0]);
    assert.ok(batch.every((ruleId) => resolveRuleCluster(ruleId) === cluster));
  }
});

test("runWithCircuitBreaker splits batches on failure", async () => {
  const calls: number[] = [];
  const result = await runWithCircuitBreaker(
    [1, 2, 3, 4],
    async (items) => {
      calls.push(items.length);
      if (items.length > 1) {
        throw new Error("fail");
      }
      return items;
    },
    { maxDepth: 4 }
  );

  assert.deepStrictEqual(result, [1, 2, 3, 4]);
  assert.ok(calls.some((len) => len > 1));
});
