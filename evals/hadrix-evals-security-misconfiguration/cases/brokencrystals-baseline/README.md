# Partner Embed Inventory

A small Partner Embed Inventory API for BrokenCrystals partners to power a shop widget with the latest catalog and stock counts. The Express app created by `buildPartnerEmbedApp` serves the partner inventory payload at `/api/partner/embed/inventory`.

**Run**
1. Mount `buildPartnerEmbedApp()` in an Express server and listen on a port.
2. Request `/api/partner/embed/inventory` to fetch the widget inventory.

Example request:
```bash
curl http://localhost:3000/api/partner/embed/inventory
```
