# Evals Sanity Check

This is a tiny repo used for quick Hadrix sanity checks. It intentionally contains
one vulnerability copied from `evals/hadrix-evals-nextjs`.

## Included vulnerability
- **A03 Injection**: unsafe raw SQL execution helper (from `lib/unsafeSql.ts`).

## Files
- `src/unsafeSql.ts` — intentionally unsafe SQL helper with a HADRIX_VULN marker.
