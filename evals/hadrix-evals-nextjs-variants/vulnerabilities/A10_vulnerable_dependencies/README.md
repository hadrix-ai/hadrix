# A10: Dependency Risk Signals

This category tests detection of known issues in third-party dependencies using OSV-Scanner.

## Package Signals

| Package | Version | Issue | Severity |
|---------|---------|-------|----------|
| `axios` | 0.21.0 | Regex performance issue in trim function (GHSA-cph5-m8f7-6c5x) | High |
| `lodash` | 4.17.10 | Template function allows command execution (GHSA-35jh-r3h4-6jhm) | High |
| `jsonwebtoken` | 4.2.1 | Unrestricted key type in signature validation (GHSA-hjrf-2m68-5959) | High |

## Detection Method

OSV-Scanner analyzes `package-lock.json` and queries the OSV database (aggregates CVEs from npm, GitHub Advisories, etc.) to identify packages with known issues.

## References

- [OWASP Top 10](https://owasp.org/Top10/)
- [OSV Database](https://osv.dev/)
- [npm Security Advisories](https://www.npmjs.com/advisories)
