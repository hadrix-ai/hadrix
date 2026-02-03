# Enabling / disabling secrets exposure fixtures

Edit `hadrix.config.json`:

- `vulnerabilities.A02_security_misconfiguration.frontend_secret_exposure`

Note: These fixtures embed secrets directly in client code; in real apps, move them to server-only env or secret managers.
