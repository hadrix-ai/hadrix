# Hadrix React + Supabase Vulnerable Fixture (OWASP Top 10: 2025)

This repository is an **intentionally vulnerable** demo app for **Hadrix**, designed to look like a real small SaaS startup product while containing **toggleable, modular vulnerabilities** across the OWASP Top 10 (2025).

App concept: **"Orbit Projects"** — a multi-tenant project tracker with org workspaces, projects, and an admin console.

## Stack

- Frontend: Next.js (React, TypeScript) in `frontend/`
- Backend: Supabase Edge Functions (TypeScript / Deno) in `backend/supabase/functions/`
- Database: Supabase Postgres + RLS (SQL) in `backend/supabase/migrations/` and `db/`
- Auth: Supabase Auth (email/password)

## Intentional Vulnerability Model

All vulnerabilities are implemented as **“infection layers”** controlled by `hadrix.config.json`.

- Default mode is intentionally unsafe for scanner evals.
- Toggle flags in `hadrix.config.json` to enable/disable specific issues.
- Code includes markers like `// HADRIX_VULN: A01 Broken Access Control`.

## Quick start (optional)

This repo is designed for static analysis and scanner evals. To run it locally you would:

1. Create a Supabase project and apply SQL in `db/` or `backend/supabase/migrations/`.
2. Configure `frontend/.env.local` using `frontend/env.example`.
3. Run the frontend:
   - `cd frontend && npm i && npm run dev`

## Where to look

- Frontend routes: `frontend/app/`
- Edge functions: `backend/supabase/functions/`
- DB + RLS: `db/` and `backend/supabase/migrations/`
- Vulnerability documentation: `vulnerabilities/`

## ⚠️ Warning

Do not deploy this to production. It includes:

- Broken authorization and RLS bypasses
- SQL/command injection
- Hardcoded weak secrets and plaintext tokens
- Unsafe webhook handling
- Missing rate limits and resilience controls
- Logging of sensitive data

