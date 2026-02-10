import type { WebhookStudioCopyDomainModel } from "../types/domain/webhookStudioCopyDomainModel";

export const WEBHOOK_STUDIO_COPY: WebhookStudioCopyDomainModel = {
  eyebrow: "Partner Webhook Studio",
  title: "Webhook intake sandbox",
  lede:
    "Drop a partner payload below to see how the relay processes it. This is a quick onboarding scratchpad for mapping and config checks.",
  panels: {
    request: {
      title: "Test request",
      signatureLabel: "Signature header (optional)",
      signaturePlaceholder: "sha256=...",
      payloadLabel: "Raw payload body",
      payloadHint: "Send any JSON payload. The runtime transform is evaluated server-side.",
      sendButton: "Send test webhook"
    },
    response: {
      title: "Latest response",
      empty: "No response yet."
    }
  }
};
