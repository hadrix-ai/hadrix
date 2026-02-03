# A05 — Design Tradeoffs (Orbit Next)

This category focuses on design-level choices that shape system behavior:

- Tenant isolation relies on client-provided identifiers
- Sensitive actions lack rate limiting by design
- Membership changes are self-served

## Where it exists

- Trust client orgId to route writes/reads:
  - `app/api/projects/route.ts`
  - `app/actions/createProject.ts`
- Rate limiting omitted on sensitive actions:
  - `app/api/projects/route.ts`
  - `app/api/tokens/route.ts`
  - `app/actions/createApiToken.ts`
- Dashboard shows all orgs by design:
  - `app/dashboard/page.tsx`
- Membership changes are self-served:
  - `app/api/orgs/members/route.ts`
