# Hadrix CLI

Hadrix performs a local, read-only security scan and writes results to the terminal or JSON.
Default scans target common source files plus schema files (including `.sql`).

## Quick start

```bash
npm install
```

```bash
npm run dev -- setup
```

```bash
HADRIX_PROVIDER=gemini \
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
HADRIX_PROVIDER=gemini HADRIX_API_KEY=... node dist/cli.js scan /path/to/repo
```

## Run after installing globally

```bash
npm install -g hadrix
hadrix setup
HADRIX_PROVIDER=openai HADRIX_API_KEY=sk-... hadrix scan /path/to/repo
```

## Monorepo support

When scanning a monorepo root, Hadrix will try to infer an app root and scope the scan to that subdirectory.
You can override or disable inference:

```bash
hadrix scan /path/to/monorepo --repo-path ui
hadrix scan /path/to/monorepo --no-repo-path-inference
```

You can also set `repoPath` in `hadrix.config.json` or `HADRIX_REPO_PATH`.

## Running evals locally

Hadrix can run the same eval suites used in CI, but using the local CLI scan logic.

1) Clone the fixture repos into a local directory (default: `./.hadrix-eval-fixtures`):

```bash
mkdir -p .hadrix-eval-fixtures
git clone https://github.com/hadrix-ai/hadrix-evals-react-supabase .hadrix-eval-fixtures/hadrix-evals-react-supabase
git clone https://github.com/hadrix-ai/hadrix-evals-nextjs .hadrix-eval-fixtures/hadrix-evals-nextjs
```

2) Run the evals:

```bash
HADRIX_PROVIDER=openai HADRIX_API_KEY=sk-... hadrix evals
```

Evals always use the OpenAI comparator for matching, using the same env as the scan LLM:
- `HADRIX_LLM_API_KEY` (or `OPENAI_API_KEY`) must be set for eval comparisons.
- Defaults to model `gpt-4o-mini`. If `HADRIX_LLM_PROVIDER=openai`, the comparator uses `HADRIX_LLM_MODEL` by default.

Optional flags:

- `--spec <id>` / `--group <id>` to run a subset. Available specs:
  - `hadrix-evals-react-supabase`
  - `hadrix-evals-nextjs`
- `--fixtures <dir>` or positional `hadrix evals <dir>` to point at a different fixture directory.
- `--repo <path>` to run a single spec against a specific repo path (requires `--spec`).
- `--json` for machine-readable output.
- `--debug` to enable debug logs (written under `--out-dir/logs` by default).
- `--debug-log <path>` to control debug log output. For multiple specs, the spec id is added to the filename.

Artifacts are written to `./.hadrix-evals` by default:
- `results.json` (full eval output)
- `summary.md` (human-readable summary)

Note: datastore/RLS eval groups are present in the suite but always skipped by the CLI.

## Static scanners

Hadrix runs ESLint security rules for JS/TS and uses these scanners:

- eslint (installed via npm dependencies)
- semgrep
- gitleaks
- osv-scanner

ESLint security rules are bundled with the CLI; no extra setup required. Run `hadrix setup` to install the external scanners (semgrep, gitleaks, osv-scanner) interactively. Hadrix will also look for tools in `~/.hadrix/tools` and on your `PATH`.

## Vector search modes

Hadrix uses fast vector search when a native accelerator is available. If it is not available on your platform, Hadrix automatically uses a portable mode with the same results but slower execution.

When falling back, Hadrix prints a single informational message:

```
Fast vector search unavailable; using portable mode.
```

### Fast vs portable mode

- Fast mode uses `vectorlite` for in-database vector search (native extension).
- Portable mode stores embeddings in SQLite and runs cosine similarity in pure JavaScript.
- Portable mode is correct but slower, especially on larger repos. Fast mode is significantly faster for top‑k similarity search.

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

## CLI options

- `--format json` (or `--json`) outputs machine-readable JSON and disables the spinner.
- `--repo-path <path>` scopes a monorepo scan to a subdirectory.
- `--no-repo-path-inference` disables monorepo repoPath inference.
- `--skip-jelly-anchors` skips jelly call-graph anchors for this run.
- `--debug` enables debug logging to a file.
- `--debug-log <path>` sets the debug log file path (implies `--debug`).

## Feature flags

These flags gate upcoming parity features and are off by default until the CLI wiring lands.

- `ENABLE_SECURITY_CHUNKING=true|false` (default: false)
- `ENABLE_JELLY_ANCHORS=true|false` (default: false)

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
