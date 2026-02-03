# Enabling / disabling A07 fixtures

Edit `hadrix.config.json`:

- `vulnerabilities.A07_software_data_integrity_failures.webhook_signature_skip`
- `vulnerabilities.A07_software_data_integrity_failures.runtime_config_exec`
- `vulnerabilities.A07_software_data_integrity_failures.integrity_check_skip`

These toggles cover the BrokenCrystals, Next.js, Supabase, and NodeGoat fixtures in this eval repo.
