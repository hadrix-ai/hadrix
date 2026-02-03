# Evals

Hadrix can run the same eval suites used in CI, but using the local CLI scan logic.

Fixtures are vendored under `./evals` by default, so you can run:

```bash
HADRIX_PROVIDER=openai HADRIX_API_KEY=sk-... hadrix evals
```

Evals always use the OpenAI comparator for matching, using the same env as the scan LLM:
- `HADRIX_LLM_API_KEY` (or `OPENAI_API_KEY`) must be set for eval comparisons.
- Defaults to model `gpt-5.1-codex-mini`. If `HADRIX_LLM_PROVIDER=openai`, the comparator uses `HADRIX_LLM_MODEL` by default.

Optional flags:

- `--spec <id>` / `--group <id>` to run a subset. Available specs:
  - Utility:
    - `evals-sanity-check`
  - Category specs (vulnerability-focused):
    - `hadrix-evals-sql-injection`
    - `hadrix-evals-idor`
    - `hadrix-evals-command-injection`
    - `hadrix-evals-xss`
    - `hadrix-evals-admin-authz`
    - `hadrix-evals-tenant-isolation`
    - `hadrix-evals-frontend-authz`
    - `hadrix-evals-rls-exposure`
    - `hadrix-evals-auth-failures`
    - `hadrix-evals-security-misconfiguration`
    - `hadrix-evals-secrets-exposure`
    - `hadrix-evals-crypto-failures`
    - `hadrix-evals-software-integrity`
    - `hadrix-evals-logging-monitoring`
    - `hadrix-evals-dos-resilience`
    - `hadrix-evals-file-upload`
    - `hadrix-evals-frontend-direct-db-write`
  - App-based suites (kept for parity runs):
    - `hadrix-evals-react-supabase`
- Variant suites are tracked in `evals/EVAL_VARIANTS_CHECKLIST.md`. When variant fixtures/specs are present, they use a `-variants` suffix (for example `hadrix-evals-react-supabase-variants`). Point `--fixtures` or `HADRIX_EVALS_DIR` at the directory containing those repos when running them.
- `--fixtures <dir>` or positional `hadrix evals <dir>` to point at a different fixture directory.
- `HADRIX_EVALS_DIR=<dir>` to override the default fixtures directory.
- `--repo <path>` to run a single spec against a specific repo path (requires `--spec`).
- `--config <path>` to point at a per-repo config file for the eval scan.
- `--repo-path <path>` and `--no-repo-path-inference` to control monorepo scoping.
- `--threshold <num>`, `--short-circuit <num>`, `--concurrency <num>` to tune comparator behavior.
- `--out-dir <path>` for eval artifacts (defaults to `./.hadrix-evals`).
- `--json` for machine-readable output.
- `--skip-static` to skip static scanners.
- `--debug` to enable debug logs (written under `--out-dir/logs` by default).
- `--debug-log <path>` to control debug log output. For multiple specs, the spec id is added to the filename.

Artifacts are written to `./.hadrix-evals` by default:
- `results.json` (full eval output)
- `summary.md` (human-readable summary)

Note: datastore/RLS eval groups are present in the suite but always skipped by the CLI.

## Category suite run log
- 2026-02-02: Attempted to run category suites locally (starting with `hadrix evals --spec hadrix-evals-sql-injection`). Run aborted before suite execution because the eval comparator requires an OpenAI API key (`HADRIX_LLM_API_KEY`/`OPENAI_API_KEY`). No category suite results recorded.
