# Deterministic Eval Matching (Identity-Key Based)

## Context

Hadrix evals currently match `ExpectedFinding` entries (human-written `expectation` text) against actual scan findings by comparing `expected.expectation` to `actual.summary`.

Today this matching is not deterministic and adds significant latency:

- `src/evals/runEvals.ts` always constructs `createOpenAiSummaryComparator()` and passes it into the evaluator.
- `src/evals/openAiComparator.ts` calls the OpenAI API to judge whether two summaries “mean the same thing”, with heuristic fallbacks (including token/Jaccard) when the model output cannot be parsed.
- The match outcome can vary with model choice, model updates, retries/timeouts, and small phrasing differences in either expected text or the scanner’s summary text.
- It also adds network round-trips during eval runs, increasing wall-clock time and introducing external failure modes.

Separately, Hadrix already computes a stable-ish identifier for findings for deduplication:

- `src/scan/dedupeKey.ts` builds `details.identityKey` / `details.dedupeKey` from location + rule/type + anchor information.
- Many findings (static and LLM) already carry `details.identityKey` in scan outputs.

This design proposes making eval matching deterministic by matching on an explicit, versioned identity key rather than semantic text comparison.

## Why This Change

**Goal: reduce nondeterminism in eval results caused by the matching layer.**

Evals should fail when the scanner stops emitting a specific expected finding, not because:

- the judge model disagreed with itself,
- the summary wording drifted,
- a token similarity threshold flipped,
- or the network judge timed out.

**Goal: reduce eval latency from the matching layer.**

If matching is exact and local, eval runs avoid:

- per-comparison OpenAI requests,
- retries/backoffs,
- and N×M candidate scoring loops.

This does **not** attempt to make the scan output itself deterministic (LLM scanning can still vary). It makes the eval harness deterministic about what it considers a “match”.

## Non-Goals

- Making repository scanning fully deterministic across LLM models.
- Changing the rule catalog semantics.
- Improving rule selection/evaluation accuracy (this design only targets the eval matcher).

## Proposed Approach

### Summary

1. Introduce a new, **versioned** identity key for eval matching: `identityKeyV2`.
2. Ensure `identityKeyV2` is derived only from **deterministic** fields (no LLM text, no randomness).
3. Require eval expectations to declare the identity (directly as a key or as structured components).
4. Replace the eval matcher with exact identity-key matching (no OpenAI judge, no Jaccard).

### IdentityKeyV2: Feasible Definition

IdentityKeyV2 should be:

- Stable across runs on the same codebase.
- Independent of LLM phrasing (no `summary`, no `rationale`).
- Independent of random IDs (notably, current `overlapGroupId` is generated via `crypto.randomUUID()` in `src/chunking/securityChunker.ts`).
- Specific enough to distinguish multiple findings in the same file.

#### Canonical Format (string)

```
v2|<filepath>|<ruleId>|<anchor>
```

Where:

- `filepath` is repo-relative, normalized to forward slashes, no leading `./`.
- `ruleId` is the canonical rule identifier (or static rule id), normalized to a stable form (lowercase, trimmed).
- `anchor` is a stable locator within the file.

#### Anchor Precedence (stable locator)

Use the first available:

1. `anchor:...` (preferred)
   - `anchor:<anchorNodeId>`
   - Sourced from `details.anchorNodeId` (Jelly) when available.
2. `lines:...`
   - `lines:<startLine>-<endLine>`
   - Sourced from normalized `location.startLine`/`location.endLine`.
3. `chunk:...` (last resort)
   - `chunk:<chunkIndex>` or `chunklines:<chunkStart>-<chunkEnd>`
   - Only acceptable if chunking is deterministic.

**Important:** IdentityKeyV2 must not incorporate `overlapGroupId` unless it is made deterministic.

#### Examples

```
v2|cases/nextjs-baseline/app/api/debug/route.ts|missing_authentication|anchor:jelly:cases/nextjs-baseline/app/api/debug/route.ts:4:8:21:2

v2|cases/supabase-baseline/frontend/utils/api.ts|anon_key_bearer|lines:26-33
```

### What Changes In The Codebase

#### 1) Scanner output: emit `details.identityKeyV2`

For both static findings and repository (LLM) findings, attach:

- `details.ruleId` (already present for most findings)
- `details.anchorNodeId` when available (already present for many static findings; sometimes for LLM findings)
- `details.identityKeyV2` computed from deterministic fields

Notes:

- `details.identityKey` / `details.dedupeKey` today are used for dedupe. We can keep them as-is initially.
- `identityKeyV2` is specifically designed for eval determinism, even if it is more strict than existing dedupe.

Candidate implementation location:

- Add a new builder in `src/scan/dedupeKey.ts` (or a small new module) to compute `identityKeyV2`.
- Call it from normalization paths that already populate `details.identityKey` (e.g., `src/scan/post/postProcessing.ts` and static finding conversion in `src/scan/runScan.ts`).

#### 2) Remove randomness from identity inputs

Today, chunk overlap grouping uses random UUIDs:

- `src/chunking/securityChunker.ts` sets `overlapGroupId = crypto.randomUUID()` in multiple chunking paths.
- `src/scan/dedupeKey.ts` will use `overlapGroupId` as an anchor fallback when `anchorNodeId` is absent.

For deterministic eval IDs, there are two acceptable strategies:

- Strategy A (preferred): do not use `overlapGroupId` in `identityKeyV2` at all.
- Strategy B: make `overlapGroupId` deterministic (hash derived from filepath + selected chunk ranges + anchor key), then allow it as a fallback.

This design assumes Strategy A for simplicity and robustness.

#### 3) Eval expectations: specify identity, not semantics

Extend the expected finding schema to carry identity information:

- Add `identityKeyV2?: string` to `ExpectedFinding` in `src/evals/types.ts`.
- Require `ruleId` for deterministic eval suites. (Expectation text can remain for readability, but it won’t be used for matching.)
- Optionally allow structured identity input as an alternative to a precomputed key:
  - `startLine`, `endLine` (already exist on `ExpectedFinding`)
  - `anchorNodeId` (new optional field) if we want stable anchors when line numbers drift

#### 4) Evaluator: exact identity matching

Replace the current matching pipeline (semantic judge + fallbacks) with:

1. Filter actual findings to the expected file (`filepath`, with existing glob support).
2. Compute/compare identity:
   - If `expected.identityKeyV2` is present: exact match against `actual.details.identityKeyV2`.
   - Else compute `expected.identityKeyV2` from `filepath + ruleId + anchor` and match.
3. If no match: missing.

This eliminates:

- OpenAI API calls during matching.
- Token/Jaccard scoring.
- Heuristic rule-hint guessing in the matcher.

## Performance & Determinism Properties

### Determinism

With identity-key matching:

- The matcher is deterministic given the same inputs.
- Match results do not depend on a model judge, network conditions, or text phrasing.

This does not guarantee deterministic scan outputs, but it ensures the eval harness is strict and stable about what it considers “the same” finding.

### Latency

Identity matching is local and fast:

- Matching becomes O(E + A) per group (expected + actual), using maps keyed by `identityKeyV2`.
- Removes per-comparison OpenAI requests and their retries/timeouts.

## Tradeoffs

### Pros

- Deterministic match outcomes.
- Much faster eval matching (no network).
- Cleaner failure modes: if a finding’s identity changes, the eval fails loudly.

### Cons / Implications

- Evals become stricter: if the scanner changes `ruleId` or location anchors, evals will fail even if the “meaning” is similar.
- To keep evals stable, expected findings must carry stable identity components (`ruleId` + anchor).
- “Open scan” findings are inherently less stable. Deterministic eval suites should avoid depending on open-scan-only findings unless they are anchored precisely.

## Migration Plan

1. **Add `identityKeyV2` to actual findings** (no behavior change yet).
2. **Extend `ExpectedFinding` to accept `identityKeyV2`** and incrementally update eval suites to include it (or `ruleId + anchor`).
3. **Switch eval matching to identity keys by default** and remove the OpenAI comparator from the eval runner.
4. Optionally keep the OpenAI comparator available only for ad-hoc/manual analyses (not part of deterministic eval runs).

## Testing Plan

- Unit tests for `identityKeyV2` generation:
  - stable across runs
  - stable across OS path normalization
  - no dependency on `summary` or other model-authored strings
- Fixture-level eval tests:
  - expected `identityKeyV2` matches a known scan output
  - verify no OpenAI comparator calls occur in eval runs

## Open Questions

- Do we want to require `anchorNodeId` for deterministic evals (strongest), or allow `lines:` anchors (more flexible but sensitive to line drift)?
- Should identity include `tool/source` to distinguish static vs LLM findings when they share the same `ruleId` and location?
- How should we treat aggregated/composite findings (multiple sources merged) in deterministic evals?

