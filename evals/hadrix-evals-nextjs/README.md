# Hadrix Next.js Vulnerable Fixture (OWASP Top 10: 2025)

This repository is an **intentionally vulnerable** demo app for **Hadrix**, designed to look like a real small SaaS startup product while containing **toggleable, modular vulnerabilities** across the OWASP Top 10 (2025).

App concept: **"Orbit Next"** — a multi-tenant project tracker with org workspaces, projects, API tokens, and webhooks.

## Stack

- Fullstack: Next.js (App Router, Route Handlers, Server Actions)
- Backend data: Supabase (via `@supabase/supabase-js`)
- Database: Postgres (SQL fixtures in `db/`)
- Auth: JWT (intentionally weak in places)

## Intentional Vulnerability Model

All vulnerabilities are implemented as **"infection layers"** controlled by `hadrix.config.json`.

- Default mode is intentionally unsafe for scanner evals.
- Toggle flags in `hadrix.config.json` to enable/disable specific issues.
- Code includes markers like `// HADRIX_VULN: A01 Broken Access Control`.

## Quick start (optional)

This repo is designed for static analysis and scanner evals. To run it locally you would:

1. Create a Supabase project and apply SQL in `db/`.
2. Configure `.env.local` using `env.example`.
3. Install deps and run:
   - `npm i && npm run dev`

## Where to look

- Frontend routes: `app/`
- Route handlers: `app/api/`
- Server actions: `app/actions/`
- Shared utilities: `lib/`
- DB + RLS fixtures: `db/`
- Vulnerability documentation: `vulnerabilities/`

## ⚠️ Warning

Do not deploy this to production. It includes:

- Broken authorization and tenant isolation
- SQL/command injection and stored XSS
- Hardcoded weak secrets and plaintext tokens
- Unsafe webhook handling
- Missing rate limits and resilience controls
- Logging of sensitive data
