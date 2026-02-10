"use client";

import { useState } from "react";

import { WEBHOOK_STUDIO_COPY } from "../../constants/webhookStudioCopy";

const WEBHOOK_ENDPOINT = "/api/webhook";
const WEBHOOK_SIGNATURE_HEADER = "x-webhook-signature";
const DEFAULT_PAYLOAD = `{
  "type": "invoice.paid",
  "transform": "return payload;",
  "configUrl": ""
}`;

type WebhookResponse = {
  ok?: boolean;
  error?: string;
  transformed?: unknown;
};

function formatResponse(raw: string) {
  const trimmed = raw.trim();

  if (!trimmed) {
    return "";
  }

  try {
    const parsed = JSON.parse(trimmed) as WebhookResponse;
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    return trimmed;
  }
}

export default function WebhookStudioPage() {
  // TODO: Persist the last-used signature/payload per partner; resets on reload today.
  const [signature, setSignature] = useState("");
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [status, setStatus] = useState("idle");
  const [responseBody, setResponseBody] = useState("");
  const [busy, setBusy] = useState(false);

  const sendWebhook = async () => {
    setBusy(true);
    setStatus("sending...");
    setResponseBody("");

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json"
      };

      const trimmedSignature = signature.trim();
      if (trimmedSignature) {
        headers[WEBHOOK_SIGNATURE_HEADER] = trimmedSignature;
      }

      const response = await fetch(WEBHOOK_ENDPOINT, {
        method: "POST",
        headers,
        body: payload
      });

      const raw = await response.text();
      setStatus(`status ${response.status}`);
      setResponseBody(formatResponse(raw));
    } catch (error) {
      setStatus("request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="studio">
      <header className="studio__header">
        <p className="studio__eyebrow">{WEBHOOK_STUDIO_COPY.eyebrow}</p>
        <h1>{WEBHOOK_STUDIO_COPY.title}</h1>
        <p className="studio__lede">{WEBHOOK_STUDIO_COPY.lede}</p>
      </header>

      <section className="studio__panel">
        <h2>{WEBHOOK_STUDIO_COPY.panels.request.title}</h2>
        <label className="studio__field">
          {WEBHOOK_STUDIO_COPY.panels.request.signatureLabel}
          <input
            value={signature}
            onChange={(event) => setSignature(event.target.value)}
            placeholder={WEBHOOK_STUDIO_COPY.panels.request.signaturePlaceholder}
          />
        </label>
        <label className="studio__field">
          {WEBHOOK_STUDIO_COPY.panels.request.payloadLabel}
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            rows={10}
          />
          <span className="studio__hint">{WEBHOOK_STUDIO_COPY.panels.request.payloadHint}</span>
        </label>
        <button type="button" onClick={sendWebhook} disabled={busy}>
          {WEBHOOK_STUDIO_COPY.panels.request.sendButton}
        </button>
        <div className="studio__status">Status: {status}</div>
      </section>

      <section className="studio__panel">
        <h2>{WEBHOOK_STUDIO_COPY.panels.response.title}</h2>
        {responseBody ? (
          <pre className="studio__response">{responseBody}</pre>
        ) : (
          <p className="studio__empty">{WEBHOOK_STUDIO_COPY.panels.response.empty}</p>
        )}
      </section>

      <style jsx>{`
        .studio {
          --studio-bg: #f2efe9;
          --studio-ink: #1f1c19;
          --studio-accent: #c85f2d;
          --studio-panel: #fff9f0;
          --studio-border: #e5d6c7;
          --studio-shadow: rgba(31, 28, 25, 0.08);
          min-height: 100vh;
          padding: 2.5rem 2rem 4rem;
          color: var(--studio-ink);
          background: radial-gradient(circle at top left, #fff4e1 0%, #f2efe9 58%, #e9e1d6 100%);
          font-family: "Space Grotesk", "Gill Sans", "Trebuchet MS", sans-serif;
          display: grid;
          gap: 1.75rem;
        }

        .studio__header {
          max-width: 720px;
          animation: studioFade 420ms ease-out;
        }

        .studio__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.75rem;
          margin: 0 0 0.5rem;
          color: var(--studio-accent);
        }

        .studio__lede {
          max-width: 580px;
          font-size: 1.05rem;
          margin: 0.75rem 0 0;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.6rem);
        }

        h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        .studio__panel {
          background: var(--studio-panel);
          border: 1px solid var(--studio-border);
          border-radius: 18px;
          padding: 1.5rem;
          box-shadow: 0 12px 28px var(--studio-shadow);
          display: grid;
          gap: 0.85rem;
          animation: studioRise 520ms ease-out;
        }

        .studio__field {
          display: grid;
          gap: 0.5rem;
          font-size: 0.95rem;
        }

        input,
        textarea {
          border: 1px solid var(--studio-border);
          border-radius: 12px;
          padding: 0.65rem 0.75rem;
          font-size: 0.95rem;
          font-family: "Space Grotesk", "Gill Sans", "Trebuchet MS", sans-serif;
          background: #fffdf9;
          color: var(--studio-ink);
        }

        textarea {
          resize: vertical;
          min-height: 180px;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 0.65rem 1.4rem;
          font-weight: 600;
          font-size: 0.95rem;
          color: #fffaf3;
          background: linear-gradient(120deg, #c85f2d, #d88449);
          cursor: pointer;
          justify-self: flex-start;
        }

        button:disabled {
          cursor: not-allowed;
          opacity: 0.7;
        }

        .studio__status {
          font-size: 0.9rem;
          color: #5a4b3f;
        }

        .studio__hint {
          font-size: 0.85rem;
          color: #6b5a4e;
        }

        .studio__response {
          background: #191715;
          color: #fef0d8;
          padding: 1rem;
          border-radius: 12px;
          overflow: auto;
          font-size: 0.85rem;
        }

        .studio__empty {
          margin: 0;
          color: #6b5a4e;
        }

        @keyframes studioFade {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes studioRise {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 720px) {
          .studio {
            padding: 2rem 1.25rem 3rem;
          }
        }
      `}</style>
    </main>
  );
}
