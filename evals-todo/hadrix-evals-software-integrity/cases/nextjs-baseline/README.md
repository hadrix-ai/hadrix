# Partner Webhook Studio

Partner Webhook Studio is a small onboarding tool for testing billing webhooks. It posts raw JSON to the `/api/webhook` handler and surfaces the response so partners can validate their payload shape and mapping script.

## Run It

1. Start a Next.js dev server with this case mounted as the app directory.
2. Visit `/webhook-studio` to send a test payload from the UI.

Example request:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H 'content-type: application/json' \
  -H 'x-webhook-signature: demo-signature' \
  -d '{"type":"invoice.paid","transform":"return payload;","configUrl":"https://partner.example/config.json"}'
```

The endpoint responds with JSON so you can confirm the webhook event was accepted and transformed.
