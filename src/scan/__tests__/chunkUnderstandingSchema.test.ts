import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChunkUnderstandingRecord } from "../repositoryScanner.js";

const fallback = { chunkId: "fallback-chunk", filePath: "src/fallback.ts" };

test("chunk understanding: minimal valid response", () => {
  const record = {
    chunk_id: "chunk-1",
    file_path: "src/handlers.ts",
    confidence: 0.42
  };

  const parsed = parseChunkUnderstandingRecord(record, fallback);

  assert.deepStrictEqual(parsed, {
    chunk_id: "chunk-1",
    file_path: "src/handlers.ts",
    confidence: 0.42,
    signals: [],
    identifiers: []
  });
});

test("chunk understanding: signals + identifiers", () => {
  const record = {
    chunk_id: "chunk-2",
    file_path: "src/api/projects.ts",
    confidence: 0.77,
    exposure: "public",
    role: "api_handler",
    data_sinks: [{ type: "exec", target: "child_process.exec" }],
    signals: [
      {
        id: "secrets_access",
        evidence: "reads process.env.API_KEY",
        confidence: 0.6
      }
    ],
    identifiers: [
      {
        name: "orgId",
        kind: "org_id",
        source: "req.params.orgId",
        trust: "untrusted"
      }
    ]
  };

  const parsed = parseChunkUnderstandingRecord(record, fallback);

  assert.deepStrictEqual(parsed, {
    chunk_id: "chunk-2",
    file_path: "src/api/projects.ts",
    confidence: 0.77,
    exposure: "public",
    role: "api_handler",
    data_sinks: [{ type: "exec", target: "child_process.exec" }],
    signals: [
      {
        id: "secrets_access",
        evidence: "reads process.env.API_KEY",
        confidence: 0.6
      },
      {
        id: "public_entrypoint",
        evidence: "exposure marked public",
        confidence: 0.85
      },
      {
        id: "api_handler",
        evidence: "role indicates API handler",
        confidence: 0.8
      },
      {
        id: "exec_sink",
        evidence: "data_sinks includes exec",
        confidence: 0.9
      }
    ],
    identifiers: [
      {
        name: "orgId",
        kind: "org_id",
        source: "req.params.orgId",
        trust: "untrusted"
      }
    ]
  });
});

test("chunk understanding: ignores unknown signal id", () => {
  const record = {
    chunk_id: "chunk-3",
    file_path: "src/api/unknown.ts",
    confidence: 0.5,
    signals: [
      {
        id: "not_a_signal",
        evidence: "made up",
        confidence: 0.2
      },
      {
        id: "authn_present",
        evidence: "checks Authorization header",
        confidence: 0.7
      }
    ]
  };

  const parsed = parseChunkUnderstandingRecord(record, fallback);
  assert.deepStrictEqual(parsed.signals, [
    {
      id: "authn_present",
      evidence: "checks Authorization header",
      confidence: 0.7
    }
  ]);
});
