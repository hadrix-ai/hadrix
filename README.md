# Hadrix
[Hadrix](https://cli.hadrix.ai/) is an AI-powered security scanner that audits your codebase for vulnerabilities. Simply run a scan and copy and paste the output into your agent of choice (Codex, Claude Code) for remediation.

NOTE: more detail can be found on https://cli.hadrix.ai. 

## How it works
We do a combination of static scanning and LLM-powered scanning. Please see https://cli.hadrix.ai/#scan-pipeline for more details on how the scan pipeline works.

## Install & Setup

Install
```bash
npm install -g hadrix
```

Setup - installs required binaries - static scanners
```bash
hadrix setup
```

Set required environment variables
```bash
export HADRIX_PROVIDER=openai
export HADRIX_API_KEY=sk-...
```
Supported providers: openai, anthropic

## Usage
Run scan
```bash
hadrix scan
```
Flags supported by the CLI
```bash
hadrix scan [target] # Target defaults to the current directory when omitted.
    -f, --format <format> Output format (text|json|core-json)
    --json Shortcut for --format json
    --skip-static Skip running static scanners
    --power Power mode switches the model from the default lightweight models (gpt-5.1-codex-mini, claude-haiku-4-5) to more capable models (gpt-5.2-codex, claude-opus-4-5); power mode gives more thorough results at higher cost.
    --debug Enable debug logging
```
Optional: provide a path to scan a specific directory. hadrix scan path/to/repo. Defaults to the current directory if no path is provided.

## Build from source
Use if you want to run Hadrix directly from the repo instead of the published npm package.

```bash
npm install
npm run dev -- setup
npm run dev -- scan /path/to/repo
```

If you omit the path scan defaults to the current directory.

## Contributing
PRs are encouraged. We check for new PRs daily. If your PR has been waiting for awhile, reach out to [Henry](https://x.com/henryborska) on X.

## License
Apache License 2.0. See **LICENSE**.
