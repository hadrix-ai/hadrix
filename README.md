# Hadrix CLI

Hadrix performs a local, read-only security scan and writes results to the terminal or JSON.

## Quick start

```bash
HADRIX_PROVIDER=openai \
HADRIX_API_KEY=sk-... \
npx hadrix scan /path/to/repo
```

```bash
HADRIX_PROVIDER=gemini \
HADRIX_API_KEY=... \
npx hadrix scan /path/to/repo
```

Use `--format json` for JSON output.

## Vector search modes

Hadrix uses fast vector search when a native accelerator is available. If it is not available on your platform, Hadrix automatically uses a portable mode with the same results but slower execution.

When falling back, Hadrix prints a single informational message:

```
Fast vector search unavailable; using portable mode.
```

## Advanced override

For debugging or power users, you can force a specific vector extension file:

```bash
HADRIX_VECTOR_EXTENSION_PATH=/absolute/path/to/vss0.dylib
```

If the override cannot be loaded, Hadrix silently falls back to portable mode.
