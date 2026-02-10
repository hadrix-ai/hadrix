# Ops Diagnostics Panel

A small Ops Diagnostics panel used by on-call staff to verify request headers and a deployment config snapshot during incident checks. The Express app built by `buildOpsDiagnosticsApp` serves the diagnostics payload at `/ops/diagnostics`.

**Run**
1. Mount `buildOpsDiagnosticsApp()` in an Express server and listen on a port.
2. Request `/ops/diagnostics` to fetch the diagnostics payload.

Example request:
```bash
curl http://localhost:3000/ops/diagnostics \
  -H 'x-trace-id: ops-123'
```
