import assert from "node:assert/strict";
import { test } from "node:test";
import { parseChunkUnderstandingRecord, shouldRunOpenScan } from "../repositoryScanner.js";

const fallback = { chunkId: "fallback", filePath: "src/unknown.ts" };

const makeUnderstanding = (record: Record<string, unknown>) =>
  parseChunkUnderstandingRecord(record, fallback);

test("open scan gating: high coverage + non-highrisk => false", () => {
  const understanding = makeUnderstanding({
    chunk_id: "chunk-safe",
    file_path: "src/service/api.ts",
    confidence: 0.7,
    signals: [
      { id: "authn_present", evidence: "checks session", confidence: 0.8 },
      { id: "authz_present", evidence: "role check", confidence: 0.7 },
      { id: "http_request_sink", evidence: "fetch call", confidence: 0.7 }
    ]
  });

  const shouldRun = shouldRunOpenScan({
    understanding,
    selectedRuleIds: ["missing_authentication", "missing_timeout", "permissive_cors", "missing_rate_limiting", "missing_security_headers"],
    ruleFindingsSoFar: [],
    strategy: "signals_primary"
  });

  assert.equal(shouldRun, false);
});

test("open scan gating: role fallback => true", () => {
  const understanding = makeUnderstanding({
    chunk_id: "chunk-role-fallback",
    file_path: "src/service/worker.ts",
    confidence: 0.4,
    role: "job_worker"
  });

  const shouldRun = shouldRunOpenScan({
    understanding,
    selectedRuleIds: ["missing_timeout", "missing_rate_limiting", "missing_audit_logging", "unbounded_query", "missing_upload_size_limit"],
    ruleFindingsSoFar: [],
    strategy: "role_fallback"
  });

  assert.equal(shouldRun, true);
});

test("open scan gating: low coverage => true", () => {
  const understanding = makeUnderstanding({
    chunk_id: "chunk-low-coverage",
    file_path: "src/service/low.ts",
    confidence: 0.6,
    signals: [{ id: "authn_present", evidence: "checks session", confidence: 0.8 }]
  });

  const shouldRun = shouldRunOpenScan({
    understanding,
    selectedRuleIds: ["missing_authentication", "missing_timeout", "missing_rate_limiting"],
    ruleFindingsSoFar: [],
    strategy: "signals_primary"
  });

  assert.equal(shouldRun, true);
});

test("open scan gating: high risk only when no findings", () => {
  const understanding = makeUnderstanding({
    chunk_id: "chunk-high-risk",
    file_path: "src/service/public.ts",
    confidence: 0.8,
    exposure: "public",
    signals: [{ id: "exec_sink", evidence: "execs command", confidence: 0.9 }]
  });

  const shouldRun = shouldRunOpenScan({
    understanding,
    selectedRuleIds: ["command_injection", "missing_authentication", "missing_rate_limiting", "missing_timeout", "missing_security_headers"],
    ruleFindingsSoFar: [],
    strategy: "signals_primary"
  });

  const shouldSkip = shouldRunOpenScan({
    understanding,
    selectedRuleIds: ["command_injection", "missing_authentication", "missing_rate_limiting", "missing_timeout", "missing_security_headers"],
    ruleFindingsSoFar: [{
      type: "command_injection",
      severity: "high",
      summary: "demo",
      location: { filepath: "src/service/public.ts" },
      details: {}
    }],
    strategy: "signals_primary"
  });

  assert.equal(shouldRun, true);
  assert.equal(shouldSkip, false);
});
