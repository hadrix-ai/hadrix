# Enabling / disabling secrets exposure fixtures

Edit `hadrix.config.json`:

- `vulnerabilities.A02_security_misconfiguration.frontend_secret_exposure`

Note: These fixtures include both client-embedded secrets and local-only config files; in real apps, keep secrets server-side or in secret managers.
