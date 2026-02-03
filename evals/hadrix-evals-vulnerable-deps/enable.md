# Enabling / disabling dependency advisory fixtures

Edit `hadrix.config.json`:

- `vulnerabilities.A10_vulnerable_dependencies.axios_regex_perf_case`
- `vulnerabilities.A10_vulnerable_dependencies.lodash_command_exec`
- `vulnerabilities.A10_vulnerable_dependencies.lodash_object_merge`
- `vulnerabilities.A10_vulnerable_dependencies.jsonwebtoken_alg_mode`

Note: Unlike code-level findings, dependency advisories are always present in the lock file when the packages are installed. The toggles control whether these findings are expected in evals.
