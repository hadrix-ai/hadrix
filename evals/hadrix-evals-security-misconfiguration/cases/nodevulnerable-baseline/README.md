# Partner Embed Status Widget

A lightweight Partner Embed Status Widget that serves a tiny status payload for customer portals. The Express app built by `buildPartnerWidgetApp` exposes the widget feed at `/api/widget/status`.

**Run**
1. Mount `buildPartnerWidgetApp()` in an Express server and listen on a port.
2. Request `/api/widget/status` to fetch the widget payload.

Example request:
```bash
curl http://localhost:3000/api/widget/status \
  -H 'x-widget-request-id: widget-ops-22'
```
