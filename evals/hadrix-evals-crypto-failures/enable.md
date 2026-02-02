# Enabling / disabling cryptographic failure fixtures

Edit `hadrix.config.json`:

- `vulnerabilities.A04_cryptographic_failures.weak_jwt_secret_fallback`
- `vulnerabilities.A04_cryptographic_failures.insecure_random_tokens`
- `vulnerabilities.A04_cryptographic_failures.plaintext_tokens_in_db`

These toggles cover the BrokenCrystals, NodeGoat, NodeVulnerable, Next.js, and Supabase fixtures.
