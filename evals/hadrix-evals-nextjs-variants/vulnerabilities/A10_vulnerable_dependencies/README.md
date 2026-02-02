# A10: Vulnerable and Outdated Components

This category tests detection of known vulnerabilities in third-party dependencies using OSV-Scanner.

## Vulnerable Packages

| Package | Version | Vulnerability | Severity |
|---------|---------|---------------|----------|
| `axios` | 0.21.0 | ReDoS in trim function (GHSA-cph5-m8f7-6c5x) | High |
| `lodash` | 4.17.10 | Command Injection via template (GHSA-35jh-r3h4-6jhm) | High |
| `jsonwebtoken` | 4.2.1 | Unrestricted key type (GHSA-hjrf-2m68-5959) | High |

## Detection Method

OSV-Scanner analyzes `package-lock.json` and queries the OSV database (aggregates CVEs from npm, GitHub Advisories, etc.) to identify packages with known vulnerabilities.

## References

- [OWASP A06:2021 - Vulnerable and Outdated Components](https://owasp.org/Top10/A06_2021-Vulnerable_and_Outdated_Components/)
- [OSV Database](https://osv.dev/)
- [npm Security Advisories](https://www.npmjs.com/advisories)
