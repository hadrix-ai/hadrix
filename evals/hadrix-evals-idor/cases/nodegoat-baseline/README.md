# Support Charge Lookup

A lightweight Support Charge Lookup endpoint for support agents to pull a receipt by
transaction ID while responding to billing tickets. The Express app created by
`buildSupportChargeLookupApp` registers `GET /support/charges` and returns the
matching transaction record.

**Run**
1. Mount `buildSupportChargeLookupApp()` in an Express server and listen on a port.
2. Request `/support/charges?transactionId=...` with an `x-user-id` header.

Example request:
```bash
curl "http://localhost:3000/support/charges?transactionId=txn-123" \
  -H "x-user-id: support-42"
```
