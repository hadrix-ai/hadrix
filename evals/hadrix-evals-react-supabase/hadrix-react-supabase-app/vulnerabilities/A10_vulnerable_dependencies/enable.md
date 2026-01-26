# Enabling / disabling A10

Edit `hadrix.config.json`:

- `vulnerabilities.A10_vulnerable_dependencies.axios_redos`
- `vulnerabilities.A10_vulnerable_dependencies.lodash_command_injection`
- `vulnerabilities.A10_vulnerable_dependencies.jsonwebtoken_key_confusion`

Note: Unlike code-level vulnerabilities, dependency vulnerabilities are always present in the lock file when the packages are installed. The toggles control whether these findings are expected in evals.
