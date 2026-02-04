import assert from "node:assert/strict";
import { test } from "node:test";
import { detectJwtDecodeEvidence } from "../signals/detectors/jwtUsage.js";

test("jwt decode signal: jsonwebtoken decode", () => {
  const content = `
    import jwt from "jsonwebtoken";
    const payload = jwt.decode(rawToken);
  `;
  const evidence = detectJwtDecodeEvidence(content);
  assert.ok(evidence);
  assert.match(evidence, /jwt\.decode/i);
});

test("jwt decode signal: jose decodeJwt", () => {
  const content = `
    import { decodeJwt } from "jose";
    const payload = decodeJwt(token);
  `;
  const evidence = detectJwtDecodeEvidence(content);
  assert.ok(evidence);
  assert.match(evidence, /decodeJwt/i);
});

test("jwt decode signal: ignores verify", () => {
  const content = `
    import jwt from "jsonwebtoken";
    const payload = jwt.verify(token, secret);
  `;
  const evidence = detectJwtDecodeEvidence(content);
  assert.equal(evidence, null);
});
