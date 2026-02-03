# Enabling / disabling A02

Edit `hadrix.config.json`:

- `vulnerabilities.A02_security_misconfiguration.cors_any_origin`
- `vulnerabilities.A02_security_misconfiguration.debug_endpoint_access`
- `vulnerabilities.A02_security_misconfiguration.log_request_headers`
- `vulnerabilities.A02_security_misconfiguration.anon_key_role_override`
- `vulnerabilities.A02_security_misconfiguration.storage_bucket_open_access`

Database-side: see `backend/supabase/migrations/002_rls.sql` for webhook event access policies.
