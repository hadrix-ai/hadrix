# Hadrix Next.js Evaluation Fixture (OWASP Top 10: 2025)

This repository is an **intentionally permissive** demo app for **Hadrix**, designed to look like a real small SaaS startup product while containing **toggleable, modular scenarios** across the OWASP Top 10 (2025).

App concept: **"Orbit Next"** — a multi-tenant project tracker with org workspaces, projects, API tokens, and webhooks.

## Stack

- Fullstack: Next.js (App Router, Route Handlers, Server Actions)
- Backend data: Supabase (via `@supabase/supabase-js`)
- Database: Postgres (SQL fixtures in `db/`)
- Auth: JWT (intentionally simplified in places)

## Intentional Scenario Model

All scenarios are implemented as **"scenario layers"** controlled by `hadrix.config.json`.

- Default mode is intentionally permissive for scanner evals.
- Toggle flags in `hadrix.config.json` to enable/disable specific behaviors.
- Code includes comment markers that map to OWASP categories.

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
- Scenario documentation: `vulnerabilities/`

## ⚠️ Warning

Do not deploy this to production. It includes:

- Relaxed authorization and tenant boundaries
- Direct query construction and HTML rendering from stored content
- Embedded demo secrets and tokens
- Webhook handling with minimal verification
- Limited rate limiting and resilience controls
- Verbose logging of request data
