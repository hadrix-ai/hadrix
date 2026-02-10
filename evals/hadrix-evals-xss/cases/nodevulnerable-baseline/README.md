# Message Preview

A lightweight newsletter composer that lets authors draft a message and open a live HTML preview before sending.

**Run**
1. Create a small Express server that imports `buildMessagePreviewApp` from `server/app.ts`, calls it, and listens on a local port.
2. Visit `/compose` to enter a draft, then submit the form or open `/preview?message=...` to see the preview.
