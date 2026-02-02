# A05 — Insecure Design (Orbit Next)

This category focuses on design-level weaknesses that lead to systemic issues:

- Tenant isolation relies on client-provided identifiers
- Sensitive actions lack rate limiting by design
- No separation of duties (membership changes can be self-served)

## Where it exists

- Trust client orgId to route writes/reads:
  - `app/api/projects/route.ts`
  - `app/actions/createProject.ts`
- No rate limiting on sensitive actions:
  - `app/api/projects/route.ts`
  - `app/api/tokens/route.ts`
  - `app/actions/createApiToken.ts`
- No tenant isolation by design:
  - `app/dashboard/page.tsx`
- No separation of duties:
  - `app/api/orgs/members/route.ts`
