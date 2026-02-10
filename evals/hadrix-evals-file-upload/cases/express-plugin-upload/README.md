# Plugin Workshop Uploads

A small Plugin Workshop service for ops to list available plugins and upload new ZIP bundles. The Express app created by `buildPluginWorkshopApp` serves the roster at `/ops/plugins` and accepts uploads at `/ops/plugins/upload`.

**Run**
1. Mount `buildPluginWorkshopApp()` in an Express server and listen on a port.
2. Request `/ops/plugins` to see the current plugin roster or `POST /ops/plugins/upload` to add a plugin bundle.

Example upload request:
```bash
curl -X POST http://localhost:3000/ops/plugins/upload \
  -H "Content-Type: application/json" \
  -d '{"filename":"sample.zip","contents":"ZHVtbXk="}'
```
