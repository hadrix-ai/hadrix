# A05 — Design-Level Control Scenarios (Orbit Next)

This category focuses on design-level tradeoffs that shape system behavior:

- Org scoping relies on client-provided identifiers
- Rate limiting omitted in baseline flows
- Membership changes are self-served in the same role

## Where it exists

- Client orgId used to route writes/reads:
  - `app/api/projects/route.ts`
  - `app/actions/createProject.ts`
- Rate limiting omitted for project and token creation:
  - `app/api/projects/route.ts`
  - `app/api/tokens/route.ts`
  - `app/actions/createApiToken.ts`
- Org scoping in dashboard:
  - `app/dashboard/page.tsx`
- Membership changes are self-served:
  - `app/api/orgs/members/route.ts`
