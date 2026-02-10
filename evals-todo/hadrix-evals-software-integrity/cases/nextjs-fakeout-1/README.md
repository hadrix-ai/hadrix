# Partner Webhook Lab

Partner Webhook Lab is a lightweight sandbox for replaying partner webhook payloads against the `/api/webhook` handler and reviewing the transformed response. It is meant for onboarding support workflows where teams compare payload shapes and mapping scripts.

## Run It

1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/webhook-lab` to send a test payload from the UI.

Example request:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H 'content-type: application/json' \
  -H 'x-webhook-signature: demo-signature' \
  -d '{"type":"invoice.paid","transform":"return payload;","configUrl":"https://partner.example/config.json"}'
```

The endpoint returns JSON so you can confirm the webhook event was accepted and transformed.
