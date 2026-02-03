# A10 — Dependency Advisory Scenarios

This category tests detection of known advisories in third-party dependencies using OSV-Scanner.

## Packages under test

| Package | Version | Advisory | Severity |
|---------|---------|----------|----------|
| `axios` | 0.21.1 | Regex performance issue in trim function (GHSA-cph5-m8f7-6c5x) | High |
| `lodash` | 4.17.20 | Template function advisory (GHSA-35jh-r3h4-6jhm) | High |
| `jsonwebtoken` | 8.5.1 | Key type handling advisory (GHSA-hjrf-2m68-5959) | High |

## Detection Method

OSV-Scanner analyzes `package-lock.json` and queries the OSV database (aggregates CVEs from npm, GitHub Advisories, etc.) to identify packages with known advisories.

## References

- [OSV Database](https://osv.dev/)
- [npm Security Advisories](https://www.npmjs.com/advisories)
