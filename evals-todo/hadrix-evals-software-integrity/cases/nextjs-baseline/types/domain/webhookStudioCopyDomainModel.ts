export type WebhookStudioCopyDomainModel = {
  eyebrow: string;
  title: string;
  lede: string;
  panels: {
    request: {
      title: string;
      signatureLabel: string;
      signaturePlaceholder: string;
      payloadLabel: string;
      payloadHint: string;
      sendButton: string;
    };
    response: {
      title: string;
      empty: string;
    };
  };
};
