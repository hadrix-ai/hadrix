# BrokenCrystals Billing Relay

The Billing Relay accepts partner billing webhooks and lets partners include a small transform script to map their event shape into the internal format used by the ops dashboard. It runs as a tiny Express app with a single webhook endpoint.

## Run It

```ts
import { buildBillingRelayApp } from "./server/app.js";

const app = buildBillingRelayApp();
app.listen(4100, () => {
  console.log("Billing Relay listening on :4100");
});
```

Then post a webhook:

```bash
curl -X POST http://localhost:4100/webhooks/billing \
  -H "Content-Type: application/json" \
  -d '{"type":"invoice.paid","transform":"event.mapped = {id: event.id, amount: event.amount}; return event;","id":"inv_123","amount":4200}'
```

The relay runs the provided transform script against the incoming payload and responds with `{ "ok": true }`.
