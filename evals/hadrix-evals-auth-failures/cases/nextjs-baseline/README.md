# Launchpad Quickstart

A lightweight login flow that drops new users into the Launchpad dashboard with a handful of starter tools. The login form posts to the auth API and the dashboard renders a personalized greeting from the session context.

**Run**
1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/login` to sign in and land on `/dashboard`.

Example login request:
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"you@orbit.dev","password":"password"}'
```

Example dashboard request:
```bash
curl http://localhost:3000/dashboard \
  -H 'authorization: Bearer demo-token'
```
