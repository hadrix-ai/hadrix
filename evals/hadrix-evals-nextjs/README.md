# Hadrix Next.js Eval Fixture (OWASP Top 10: 2025)

This repository is an intentionally simplified demo app for **Hadrix**, designed to look like a real small SaaS startup product while containing **toggleable, modular evaluation scenarios** aligned with the OWASP Top 10 (2025).

App concept: **"Orbit Next"** — a multi-tenant project tracker with org workspaces, projects, API tokens, and webhooks.

## Stack

- Fullstack: Next.js (App Router, Route Handlers, Server Actions)
- Backend data: Supabase (via `@supabase/supabase-js`)
- Database: Postgres (SQL fixtures in `db/`)
- Auth: JWT (simplified for eval scenarios)

## Scenario Toggle Model

All scenarios are implemented as toggleable layers controlled by `hadrix.config.json`.

- Default mode enables broader behavior for scanner evals.
- Toggle flags in `hadrix.config.json` to enable/disable specific cases.
- Code includes markers like `// HADRIX_*` for category mapping.

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

Do not deploy this to production. It intentionally relaxes controls across access checks, data handling, and operational safeguards, such as client-sourced scoping, raw query paths, direct HTML rendering, simplified secret handling, webhook processing with optional verification, relaxed rate/timeout settings, and verbose logging.
