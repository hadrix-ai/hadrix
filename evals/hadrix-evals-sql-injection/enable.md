# Enabling / disabling SQL injection fixtures

Edit `hadrix.config.json`:

- `vulnerabilities.A03_injection.sql_injection_raw_query`
- `vulnerabilities.A03_injection.unsafe_query_builder_filter`

These toggles cover all SQL injection fixtures, including the NodeVulnerable baseline.
