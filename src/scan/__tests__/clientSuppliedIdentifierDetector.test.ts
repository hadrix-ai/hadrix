import assert from "node:assert/strict";
import { test } from "node:test";
import { detectClientSuppliedIdentifiers } from "../signals/detectors/clientSuppliedIdentifiers.js";

test("detects client-supplied ids from params and query", () => {
  const content = [
    "const email = req.params.email;",
    "const accountId = req.param('account_id');",
    "const transactionId = req.query.transactionId;"
  ].join("\n");
  const result = detectClientSuppliedIdentifiers(content);
  assert.ok(result.hasId);
  assert.ok(result.hasUserId);
  assert.ok(result.hasPathOrQueryId);
  assert.equal(result.hasOrgId, false);
  assert.ok(result.evidence.pathOrQuery);
});

test("detects destructured params and query identifiers", () => {
  const content = [
    "const { accountId } = req.params;",
    "const { org_id: orgId } = req.query;"
  ].join("\n");
  const result = detectClientSuppliedIdentifiers(content);
  assert.ok(result.hasId);
  assert.ok(result.hasOrgId);
  assert.ok(result.hasPathOrQueryId);
});

test("ignores non-identifier params", () => {
  const content = [
    "const status = req.query.status;",
    "const { page } = req.params;"
  ].join("\n");
  const result = detectClientSuppliedIdentifiers(content);
  assert.equal(result.hasId, false);
  assert.equal(result.hasUserId, false);
  assert.equal(result.hasOrgId, false);
  assert.equal(result.hasPathOrQueryId, false);
});
