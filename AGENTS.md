# Hadrix CLI — Agent Notes

Short, practical guidance for agents working in this repo.

## What this repo is
- TypeScript/Node CLI that runs static + LLM security scans.
- Primary flow lives in `src/scan/runScan.ts` and `src/scan/repositoryScanner.ts`.

## Key LLM flow (current)
- Chunking: `src/chunking/securityChunker.ts`
  - `MAX_CHUNK_LINES=160`, `OVERLAP_LINES=40`, `DEFAULT_MIN_CHUNK_SIZE=50`.
- LLM stages (all inside `scanRepository`):
  1) Chunk understanding (structured + summary)
     - Prompt: `src/scan/prompts/llmUnderstandingPrompts.ts`
  2) Family mapping (coarse threat families)
     - Prompt: `src/scan/prompts/llmUnderstandingPrompts.ts`
  3) Rule‑scoped diagnosis (max 10 rules / chunk)
     - Prompt: `src/scan/prompts/repositoryPrompts.ts`
  4) Open scan (catch‑all for non‑catalog issues)
     - Prompt: `src/scan/prompts/openScanPrompts.ts`
- Rule catalog: `src/scan/catalog/repositoryRuleCatalog.ts`.
- Deduping: `reduceRepositoryFindings(...)` in `src/scan/repositoryScanner.ts`.

## Running commands
- Setup tools:
  - `npm run dev -- setup`
- Scan:
  - `npm run dev -- scan /path/to/repo`
- Evals:
  - `npm run dev -- evals --spec hadrix-evals-react-supabase --cheap --debug`

## Logging/debug
- Evals disable the spinner when `--debug` or `--debug-log` is set so logs print live.
- LLM parse errors (understanding/family/rule/open) print to console and save raw responses in `.hadrix/llm-errors`.
- Per‑chunk family/rule fanout is logged during LLM runs.

## Config highlights
- Config file: `hadrix.config.json` or `.hadrixrc.json` (in repo root).
- Env overrides: `HADRIX_*` variables (see README).
- Default LLM models + cheap models are defined in `src/config/defaults.ts`.

## Notes for changes
- Avoid adding heavy heuristics unless explicitly requested; current gating is LLM‑driven.
- Keep prompts JSON‑only; we parse from text (no strict JSON mode).
- When changing output schema, update both prompts and `parseFindings(...)`.

## Adding functionality
- Do not introduce new environment variables or feature flags unless the user explicitly asks for them.
