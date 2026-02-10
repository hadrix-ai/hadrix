# Billing Desk Account Snapshot

A small Billing Desk API for DVWS support staff to pull an account snapshot by ID when reviewing a billing ticket. The Express app created by `buildBillingDeskApp` registers `GET /billing/accounts/:accountId` and returns the matched account record.

**Run**
1. Mount `buildBillingDeskApp()` in an Express server and listen on a port.
2. Request `/billing/accounts/:accountId` with an `x-user-id` header to fetch the snapshot.

Example request:
```bash
curl -H "x-user-id: agent-17" http://localhost:3000/billing/accounts/acc-123
```
