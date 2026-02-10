import type { WebhookLabCopyDomainModel } from "../types/domain/webhookLabCopyDomainModel";

export const WEBHOOK_LAB_COPY: WebhookLabCopyDomainModel = {
  eyebrow: "Partner Webhook Lab",
  title: "Replay vendor events with a single payload",
  lede:
    "Drop in a payload, optional signature, and any transform/config hints to mirror what partners send during onboarding.",
  panels: {
    request: {
      title: "Request composer",
      signatureLabel: "Signature header (optional)",
      signaturePlaceholder: "x-webhook-signature",
      payloadLabel: "Webhook payload",
      payloadHint: "Paste raw JSON. The server handles the rest.",
      sendButton: "Send webhook",
      sendingButton: "Sending...",
      statusPrefix: "Status:"
    },
    response: {
      title: "Webhook response",
      empty: "No response yet. Send a payload to see the output."
    }
  }
};
