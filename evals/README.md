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
  - `evals-sanity-check`
  - `hadrix-evals-sql-injection`
  - `hadrix-evals-idor`
  - `hadrix-evals-command-injection`
  - `hadrix-evals-xss`
  - `hadrix-evals-admin-authz`
  - `hadrix-evals-tenant-isolation`
  - `hadrix-evals-frontend-authz`
  - `hadrix-evals-rls-exposure`
  - `hadrix-evals-auth-failures`
  - `hadrix-evals-react-supabase`
  - `hadrix-evals-nextjs`
- Variant suites are tracked in `evals/EVAL_VARIANTS_CHECKLIST.md`. When variant fixtures/specs are present, they use a `-variants` suffix (for example `hadrix-evals-react-supabase-variants` or `hadrix-evals-nextjs-variants`). Point `--fixtures` or `HADRIX_EVALS_DIR` at the directory containing those repos when running them.
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

## Variant suite run log

2026-01-31 (local run, Node v25.2.1)
- hadrix-evals-react-supabase-variants: failed. First run aborted by semgrep CA trust error. Retry with `--skip-static` failed to load `better-sqlite3` (NODE_MODULE_VERSION 127 vs Node 25.2.1).
- hadrix-evals-nextjs-variants: not run (blocked by the same `better-sqlite3` Node mismatch).
- Commands attempted:
  - `HADRIX_PROVIDER=openai node dist/cli.js evals --spec hadrix-evals-react-supabase --repo evals/hadrix-evals-react-supabase-variants --out-dir /tmp/hadrix-evals-react-supabase-variants`
  - `HADRIX_PROVIDER=openai node dist/cli.js evals --spec hadrix-evals-react-supabase --repo evals/hadrix-evals-react-supabase-variants --out-dir /tmp/hadrix-evals-react-supabase-variants --skip-static`

2026-01-31 (local run, Node v22.22.0)
- hadrix-evals-react-supabase-variants: failed. Static scanners + jelly completed after setting `SSL_CERT_FILE`, but the LLM scan failed with an OpenAI connection error.
- hadrix-evals-nextjs-variants: not run (blocked by the same OpenAI connection error).
- Command attempted:
  - `SSL_CERT_FILE=/Users/dickymicky/.hadrix/tools/semgrep/lib/python3.14/site-packages/certifi/cacert.pem HADRIX_PROVIDER=openai /Users/dickymicky/.nvm/versions/node/v22.22.0/bin/node dist/cli.js evals --spec hadrix-evals-react-supabase --repo evals/hadrix-evals-react-supabase-variants --out-dir /tmp/hadrix-evals-react-supabase-variants`
  - Error detail: `Connection error.` with cause `ENOTFOUND` while resolving `api.openai.com`.
