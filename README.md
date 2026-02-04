# Hadrix

Hadrix is a local, read-only security scanner that combines deterministic analysis with LLM-based rule evaluation to find real vulnerabilities with low noise.

## What it does

- Deterministic signal extraction to understand code behavior
- Rule-based security checks (auth, access control, injection, misconfiguration, etc.)
- LLMs are used only to evaluate whether specific rules apply, not for free-form discovery
- Designed to minimize false positives and keep scans fast and explainable

## Installation

### Install from npm

```bash
npm install -g hadrix
hadrix setup
````

### Build from source

See the build guide:
**docs/build.md**

## Usage

```bash
hadrix scan /path/to/repo
```

Environment variables (example):

```bash
HADRIX_PROVIDER=openai
HADRIX_API_KEY=sk-...
```

## How it works (high level)

1. Optional static scans (eslint, semgrep, dependency and secret scanners)
2. Reachability analysis using Jelly
3. Security-focused chunking and deterministic sampling
4. LLM-based chunk understanding and signal extraction
5. Deterministic rule selection based on signals
6. Rule evaluation using token-budgeted LLM prompts
7. Optional fallback scan when signals are insufficient
8. Deduplication and optional composite analysis

LLMs are used only for rule evaluation, not to decide what to scan.

## Contributing

See **CONTRIBUTING.md** for guidelines on development, evals, and adding new rules or signals.

## License

Apache License 2.0. See **LICENSE**.