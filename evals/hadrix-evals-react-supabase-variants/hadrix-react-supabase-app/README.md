# Hadrix React + Supabase Eval Fixture (OWASP Top 10: 2025)

This repository is an intentionally simplified demo app for **Hadrix**, designed to look like a real small SaaS startup product while containing **toggleable, modular evaluation scenarios** aligned with the OWASP Top 10 (2025).

App concept: **"Orbit Projects"** — a multi-tenant project tracker with org workspaces, projects, and an admin console.

## Stack

- Frontend: Next.js (React, TypeScript) in `frontend/`
- Backend: Supabase Edge Functions (TypeScript / Deno) in `backend/supabase/functions/`
- Database: Supabase Postgres + RLS (SQL) in `backend/supabase/migrations/` and `db/`
- Auth: Supabase Auth (email/password)

## Scenario Toggle Model

All scenarios are implemented as toggleable layers controlled by `hadrix.config.json`.

- Default mode enables broader behavior for scanner evals.
- Toggle flags in `hadrix.config.json` to enable/disable specific cases.
- Code includes markers like `// HADRIX_*` for category mapping.

## Quick start (optional)

This repo is designed for static analysis and scanner evals. To run it locally you would:

1. Create a Supabase project and apply SQL in `db/` or `backend/supabase/migrations/`.
2. Configure `frontend/.env.local` using `frontend/env.example`.
3. Run the frontend:
   - `cd frontend && npm i && npm run dev`

## Where to look

- Frontend routes: `frontend/app/`
- Edge functions: `backend/supabase/functions/`
- DB + RLS fixtures: `db/` and `backend/supabase/migrations/`
- Scenario documentation: `vulnerabilities/`

## ⚠️ Warning

Do not deploy this to production. It intentionally relaxes controls across access checks, data handling, configuration, and operational safeguards, such as client-sourced scoping, raw query paths, direct HTML rendering, simplified secret handling, webhook processing with optional verification, relaxed rate/timeout settings, and verbose logging.
