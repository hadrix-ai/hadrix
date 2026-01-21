# Hadrix CLI

Hadrix performs a local, read-only security scan and writes results to the terminal or JSON.

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

Use `--format json` for JSON output.

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

## Static scanners

Hadrix requires three local scanners and will refuse to run without them:

- semgrep
- gitleaks
- osv-scanner

Run `hadrix setup` to install them interactively. Hadrix will also look for tools in `~/.hadrix/tools` and on your `PATH`.

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

## Architecture

```text
hadrix scan
  |
  +--> Static scanners (semgrep, gitleaks, osv-scanner)
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
