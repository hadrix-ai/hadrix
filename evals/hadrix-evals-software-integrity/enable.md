# Enabling / disabling software integrity fixtures

Edit `hadrix.config.json`:

- `vulnerabilities.A07_software_data_integrity_failures.unsigned_webhooks`
- `vulnerabilities.A07_software_data_integrity_failures.execute_user_supplied_config`
- `vulnerabilities.A07_software_data_integrity_failures.missing_integrity_checks`

These toggles cover the BrokenCrystals, Next.js, Supabase, and NodeGoat software integrity fixtures.
