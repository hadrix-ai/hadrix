# Support Profile Lookup

A small Support Profile Lookup API for BrokenCrystals agents to fetch a customer record by email while triaging tickets. The Express app created by `buildSupportLookupApp` registers `GET /support/users/:email` and returns the matched profile.

**Run**
1. Mount `buildSupportLookupApp()` in an Express server and listen on a port.
2. Request `/support/users/:email` to pull a profile by email.

Example request:
```bash
curl http://localhost:3000/support/users/sky@brokencrystals.test
```
