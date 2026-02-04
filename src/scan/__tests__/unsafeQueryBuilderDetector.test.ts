import assert from "node:assert/strict";
import { test } from "node:test";
import { detectUnsafeQueryBuilderSignals } from "../signals/detectors/unsafeQueryBuilder.js";

test("detects query.or(filter) where filter comes from searchParams.get", () => {
  const content = `
    const url = new URL(req.url);
    const filter = url.searchParams.get("filter") ?? "";

    let query = supabase.from("projects").select("*");
    if (filter) query = query.or(filter);
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.ok(hit);
  assert.match(hit.ormQueryEvidence, /\.or\(/);
  assert.match(hit.untrustedInputEvidence, /searchParams\.get/);
});

test("detects query.or(orFilter) where orFilter comes from req.json() body", () => {
  const content = `
    const body = await req.json().catch(() => ({}));
    const orFilter = String((body as any).or ?? "");

    let query = sb.from("projects").select("id");
    if (orFilter) query = query.or(orFilter);
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.ok(hit);
  assert.match(hit.ormQueryEvidence, /\.or\(/);
  assert.match(hit.untrustedInputEvidence, /\borFilter\b/);
});

test("detects direct query.or(req.query.filter) expressions", () => {
  const content = `
    let query = sb.from("projects").select("*");
    query = query.or(req.query.filter);
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.ok(hit);
  assert.match(hit.ormQueryEvidence, /req\.query\.filter/);
});

test("ignores query.or(filter) when filter is a static string", () => {
  const content = `
    const filter = "status.eq.active";
    let query = sb.from("projects").select("*");
    query = query.or(filter);
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.equal(hit, null);
});

test("detects knex-like whereRaw() with interpolated request-derived values", () => {
  const content = `
    const id = req.query.id;
    const query = db("projects");
    query.whereRaw(\`id = \${id}\`);
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.ok(hit);
  assert.match(hit.ormQueryEvidence, /whereRaw/);
  assert.match(hit.untrustedInputEvidence, /req\.query/);
});

test("ignores whereRaw() when using placeholders (even if values come from request)", () => {
  const content = `
    const id = req.query.id;
    const query = db("projects");
    query.whereRaw("id = ?", [id]);
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.equal(hit, null);
});

test("detects TypeORM-like where() when building expression strings from request input", () => {
  const content = `
    const userId = req.params.userId;
    const qb = repo.createQueryBuilder("u");
    qb.where("u.id = " + userId);
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.ok(hit);
  assert.match(hit.ormQueryEvidence, /\.where\(/);
  assert.match(hit.untrustedInputEvidence, /req\.params/);
});

test("ignores TypeORM-like where() when using parameter binding", () => {
  const content = `
    const userId = req.params.userId;
    const qb = repo.createQueryBuilder("u");
    qb.where("u.id = :id", { id: userId });
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.equal(hit, null);
});

test("detects Sequelize literal() when argument is request-derived", () => {
  const content = `
    const orderBy = req.query.orderBy;
    const options = { order: Sequelize.literal(orderBy) };
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.ok(hit);
  assert.match(hit.ormQueryEvidence, /Sequelize\.literal/);
});

test("ignores Sequelize literal() when argument is static", () => {
  const content = `
    const options = { order: Sequelize.literal("created_at DESC") };
  `;

  const hit = detectUnsafeQueryBuilderSignals(content);
  assert.equal(hit, null);
});
