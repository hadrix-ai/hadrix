# Enabling / disabling A01

## Function-layer toggles

Edit `hadrix.config.json`:

- `vulnerabilities.A01_broken_access_control.idor_get_project`
- `vulnerabilities.A01_broken_access_control.admin_endpoint_missing_role_check`
- `vulnerabilities.A01_broken_access_control.frontend_only_role_enforcement`
- `vulnerabilities.A01_broken_access_control.cross_org_leakage_trusting_org_id`

## Database-layer toggles (RLS)

In `backend/supabase/migrations/002_rls.sql`, uncomment the `HADRIX_VULN` policies such as:

- `projects_select_public`
- `profiles_select_all`
- `profiles_update_any`
- `api_tokens_select_public`

