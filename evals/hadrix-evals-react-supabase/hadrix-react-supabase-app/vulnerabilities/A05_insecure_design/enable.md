# Enabling / disabling A05

Edit `hadrix.config.json`:

- `vulnerabilities.A05_insecure_design.no_rate_limit_sensitive_actions`
- `vulnerabilities.A05_insecure_design.no_tenant_isolation_by_design`
- `vulnerabilities.A05_insecure_design.no_separation_of_duties`
- `vulnerabilities.A05_insecure_design.trust_client_org_id`

Database-side: see `backend/supabase/migrations/002_rls.sql` for toggleable insecure policies.

