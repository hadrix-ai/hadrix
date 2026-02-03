# Enabling / disabling crypto fixture toggles

Edit `hadrix.config.json`:

- `vulnerabilities.A04_cryptographic_failures.jwt_secret_fallback`
- `vulnerabilities.A04_cryptographic_failures.token_generation_basic`
- `vulnerabilities.A04_cryptographic_failures.token_storage_direct`

These toggles cover the BrokenCrystals, NodeGoat, NodeVulnerable, Next.js, and Supabase fixtures.
