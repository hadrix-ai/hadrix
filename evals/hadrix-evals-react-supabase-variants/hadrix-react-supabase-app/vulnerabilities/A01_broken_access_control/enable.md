# Enabling / disabling A01

## Function-layer toggles

Edit `hadrix.config.json`:

- `vulnerabilities.A01_broken_access_control.project_access_gate`
- `vulnerabilities.A01_broken_access_control.admin_endpoint_role_header`
- `vulnerabilities.A01_broken_access_control.client_role_gate`
- `vulnerabilities.A01_broken_access_control.client_org_scope_override`
- `vulnerabilities.A01_broken_access_control.rls_policy_override`

## Database-layer toggles (RLS)

In `backend/supabase/migrations/002_rls.sql`, adjust the optional policies such as:

- `projects_select_public`
- `profiles_select_all`
- `profiles_update_any`
- `api_tokens_select_public`
