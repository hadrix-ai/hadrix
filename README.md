# Hadrix CLI

Hadrix performs a local, read-only security scan and writes results to the terminal or JSON.
Default scans target common source files plus schema files (including `.sql`).

## Requirements

- Node.js >= 22
- Python 3 (needed to install semgrep via `hadrix setup`)
- Optional: native vectorlite extension for faster vector search (auto-detected)

## Quick start

```bash
npm install
```

```bash
npm run dev -- setup
```

```bash
HADRIX_PROVIDER=openai \
HADRIX_API_KEY=... \
npm run dev -- scan /path/to/repo
```

## Run without installing globally

From the Hadrix repo:

```bash
npm install
npm run dev -- setup
HADRIX_PROVIDER=openai HADRIX_API_KEY=sk-... npm run dev -- scan /path/to/repo
```

Or build once and run the compiled CLI:

```bash
npm run build
node dist/cli.js setup
HADRIX_PROVIDER=openai HADRIX_API_KEY=... node dist/cli.js scan /path/to/repo
```

## Run after installing globally

```bash
npm install -g hadrix
hadrix setup
HADRIX_PROVIDER=openai HADRIX_API_KEY=sk-... hadrix scan /path/to/repo
```

## How the Scan Works

Signals → Candidate Rule Selection → Rule Evaluation → Findings

1. **Static scans (optional)**
Runs ESLint security rules plus Semgrep, gitleaks, and osv-scanner when enabled. These findings are treated as already reported; AI findings are deduplicated against them later.

2. **Jelly anchors + reachability index (required)**
Discovers entry points, builds a call/reachability graph, and attaches anchors used to group related code.

3. **Security chunking**
Creates semantic chunks around handlers, server actions, and security‑relevant helpers. This is not arbitrary line window slicing.

4. **Chunk sampling with deterministic inclusion**
Always includes high‑risk surfaces, dangerous sinks, and key files. Sampling reduces cost without dropping critical paths.

5. **LLM understanding + `SignalId` extraction**
An LLM produces a structured understanding of each chunk (role, inputs, sinks, auth, trust boundaries). From that, Hadrix derives `SignalId` facts. Signals are generic and composable, describe observable behavior, and are **not** vulnerabilities.

6. **Candidate rule selection + rule evaluation**
Candidate rule selection (deterministic): Each rule card declares required/optional signals. Given a chunk’s signals, eligible rule cards are selected and ranked without an LLM.
Rule evaluation (LLM, rule‑scoped): The LLM is asked, “Does this chunk show evidence that this rule applies?” This is **not** free‑form vulnerability discovery. Evidence must be quoted from the chunk, and the model should prefer no finding over guessing. Multiple rules are evaluated in a single prompt, packed by token budget (often ~10–15 rules per chunk) rather than a fixed top‑K.

7. **Optional open scan (fallback)**
Runs only when signals are sparse or when high‑risk surfaces produce no rule findings. It is a safety net, not the primary mechanism.

8. **Deduplication, normalization, and composite pass**
Findings are deduplicated across chunks and anchors, normalized vs static findings, and optionally passed through a composite analysis pass for systemic issues. No code is re‑scanned in this step.

**Design principles**
- Signals ≠ vulnerabilities. Signals describe behavior; rule cards decide risk.
- Deterministic routing, LLM for judgment. The LLM evaluates applicability, not which rules to check.
- Rule evaluation ≠ vulnerability discovery. Discovery comes from candidate rule selection plus the optional open scan.
- Recall vs performance is managed via token budgets, not hard caps like “top 5 rules”.
- Extensibility: new rules usually compose existing signals; new signals are added only when necessary.

## Supabase database scan (optional)

Hadrix can connect to Supabase to check RLS, privileges, functions, and storage buckets.
This scan is behind a feature flag; set `HADRIX_ENABLE_SUPABASE_SCHEMA_SCAN=1` to enable it.

**Important**: You need the database password (not the API keys). Find it in your Supabase Dashboard under:
**Database > Settings > Database password > Reset database password**

Interactive (TTY):

```bash
hadrix scan /path/to/repo --supabase
```

Non-interactive:

```bash
hadrix scan /path/to/repo \
  --supabase-url https://<project-ref>.supabase.co \
  --supabase-password <db-password>
```

Offline (use a schema snapshot JSON):

```bash
hadrix scan /path/to/repo --supabase-schema ./schema.json
```

Environment equivalents:
- `HADRIX_SUPABASE_URL`
- `HADRIX_SUPABASE_PASSWORD`
- `HADRIX_SUPABASE_SCHEMA_PATH`

## Configuration

Hadrix loads `hadrix.config.json` or `.hadrixrc.json` from the scan root (or `--config <path>`).
CLI flags and environment variables override config file values.

Common environment variables:

- `HADRIX_PROVIDER`, `HADRIX_API_KEY`
- `HADRIX_LLM_PROVIDER`, `HADRIX_LLM_API_KEY`, `HADRIX_LLM_MODEL`
- `HADRIX_EMBEDDINGS_PROVIDER`, `HADRIX_EMBEDDINGS_API_KEY`, `HADRIX_EMBEDDINGS_MODEL`
- `HADRIX_API_BASE`, `HADRIX_LLM_BASE`, `HADRIX_EMBEDDINGS_BASE`
- `HADRIX_LLM_ENDPOINT`, `HADRIX_EMBEDDINGS_ENDPOINT`
- `HADRIX_LLM_MAX_CONCURRENCY`, `HADRIX_LLM_REQUESTS_PER_MINUTE`, `HADRIX_LLM_TOKENS_PER_MINUTE`
- `HADRIX_LLM_REASONING` (set to `1` to enable reasoning mode)
- `HADRIX_LLM_REASONING_MODEL` (optional model override when reasoning is enabled)
- `HADRIX_API_HEADERS` (JSON string)
- `HADRIX_REPO_PATH`
- `HADRIX_CHEAP_MODE` (set to `1` to use cheap LLM models)
- `HADRIX_VECTOR_EXTENSION_PATH`
- `HADRIX_SEMGREP_PATH`, `HADRIX_GITLEAKS_PATH`, `HADRIX_OSV_SCANNER_PATH`, `HADRIX_SEMGREP_CONFIG`
- Provider fallbacks: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_BASE`, `ANTHROPIC_API_BASE`

## Providers

Hadrix supports `openai` (default) and `anthropic` (alias: `claude`) for LLM scans.
For Anthropic, set `HADRIX_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` (or `HADRIX_API_KEY`).
Hadrix uses the official OpenAI and Anthropic SDKs. OpenAI requests use the Responses API by default, and Anthropic requests use the Messages API. If you override `HADRIX_LLM_BASE` or `HADRIX_LLM_ENDPOINT`, provide a base URL (the SDKs handle endpoint paths).

## Monorepo support

When scanning a monorepo root, Hadrix will try to infer an app root and scope the scan to that subdirectory.
You can override or disable inference:

```bash
hadrix scan /path/to/monorepo --repo-path ui
hadrix scan /path/to/monorepo --no-repo-path-inference
```

You can also set `repoPath` in `hadrix.config.json` or `HADRIX_REPO_PATH`.

## Running evals locally

Evals are a repo-only workflow. The fixtures live under `./evals` in this repo and are not shipped in the npm package. Evals always use the OpenAI SDK comparator (Responses API) for matching. See `evals/README.md` for the full eval runner guide.

## Static scanners

Hadrix runs ESLint security rules for JS/TS and uses these scanners:

- eslint (installed via npm dependencies)
- semgrep
- gitleaks
- osv-scanner

ESLint security rules are bundled with the CLI; no extra setup required. Run `hadrix setup` (or `hadrix setup -y`) to install the external scanners (semgrep, gitleaks, osv-scanner) and the required Jelly call graph analyzer. Hadrix will also look for tools in `~/.hadrix/tools` and on your `PATH`. Use `--skip-static` to skip static scanners.

## Vector search modes

Hadrix uses fast vector search when a native accelerator is available. If it is not available on your platform, Hadrix automatically uses a portable mode with the same results but slower execution.

When falling back, Hadrix prints a single informational message:

```
Fast vector search unavailable; using portable mode.
```

### Fast vs portable mode

- Fast mode uses `vectorlite` for in-database vector search (native extension).
- Portable mode stores embeddings in SQLite and runs cosine similarity in pure JavaScript.
- Portable mode is correct but slower, especially on larger repos. Fast mode is significantly faster for top-k similarity search.

## Advanced override

For debugging or power users, you can force a specific vector extension file:

```bash
HADRIX_VECTOR_EXTENSION_PATH=/absolute/path/to/vectorlite.dylib
```

If the override cannot be loaded, Hadrix silently falls back to portable mode.

## Debug logging

Use debug logging to trace rule-pass tasks and dedupe/merge behavior. Output is JSONL (one JSON object per line).

```bash
hadrix scan /path/to/repo --debug
```

By default logs are written under `<scan-target>/.hadrix/logs` with a timestamped filename like
`scan-debug-2024-05-01T12-34-56-789Z.jsonl`. To control the path:

```bash
hadrix scan /path/to/repo --debug-log ./scan-debug.jsonl
```

## Reports

Scan reports are written under `<scan-target>/.hadrix/reports`, including:

- `dedupe-report-<timestamp>.json` for dedupe counts and coverage stats.
- `jelly-anchors-report-<timestamp>.json` for jelly anchor status and counts.

## CLI options

### scan

- `--format <text|json|core-json>` (or `--json`) outputs machine-readable JSON and disables the spinner.
- `--config <path>` path to `hadrix.config.json`.
- `--repo-path <path>` scopes a monorepo scan to a subdirectory.
- `--no-repo-path-inference` disables monorepo repoPath inference.
- `--skip-static` skips static scanners.
- `--supabase` / `--supabase-url <url>` / `--supabase-password <password>` / `--supabase-schema <path>`
- `--existing-findings <path>` JSON array or file path for prior findings.
- `--repo-full-name <name>` / `--repo-id <id>` / `--commit-sha <sha>` metadata overrides.
- `--reasoning` enables reasoning mode (uses the reasoning model when configured).
- `--debug` enables debug logging to a file.
- `--debug-log <path>` sets the debug log file path (implies `--debug`).

### evals

- `--fixtures <path>` / positional `hadrix evals <dir>`
- `--spec <id>` / `--group <id>`
- `--repo <path>` (requires `--spec`)
- `--config <path>`
- `--repo-path <path>` / `--no-repo-path-inference`
- `--threshold <num>` / `--short-circuit <num>` / `--concurrency <num>`
- `--out-dir <path>`
- `--json`
- `--skip-static`
- `--reasoning`
- `--debug` / `--debug-log <path>`

## Chunking and anchors

Security chunking is always used for scans. The Jelly call graph analyzer must be installed (use `hadrix setup`). For non-JS/TS repos, Jelly returns `repo_not_js_ts` and the scan continues without anchors; other Jelly failures stop the scan.

## Architecture

```text
hadrix scan
  |
  +--> Static scanners (eslint, semgrep, gitleaks, osv-scanner)
  |       |
  |       +--> existing findings ------------------------------+
  |                                                            |
  +--> File discovery -> Chunking -> Embeddings -> SQLite       |
        (vectorlite fast mode or portable mode)                 |
          |                                                     |
          +--> Vector retrieval (top-k)                         |
          +--> Heuristic sampling + file role analysis          |
                        |                                       |
                        +--> Candidate findings                |
                                |                              |
                                v                              |
                          LLM map scan (per-file) <-------------+
                                |
                                +--> Candidate promotion
                                |
                                +--> Composite pass (repo-wide)
                                |
                                v
                           Findings output
```

## License

Apache License 2.0. See `LICENSE`.
