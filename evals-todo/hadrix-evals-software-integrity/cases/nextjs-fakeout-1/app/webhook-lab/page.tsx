"use client";

import { useState } from "react";

import { WEBHOOK_LAB_COPY } from "../../constants/webhookLabCopy";

const WEBHOOK_ENDPOINT = "/api/webhook";
const WEBHOOK_SIGNATURE_HEADER = "x-webhook-signature";
const DEFAULT_PAYLOAD = `{
  "type": "invoice.paid",
  "transform": "return payload;",
  "configUrl": ""
}`;

const copy = WEBHOOK_LAB_COPY;

type WebhookLabResponse = {
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
    const parsed = JSON.parse(trimmed) as WebhookLabResponse;
    return JSON.stringify(parsed, null, 2);
  } catch (error) {
    return trimmed;
  }
}

export default function WebhookLabPage() {
  const [signature, setSignature] = useState("");
  const [payload, setPayload] = useState(DEFAULT_PAYLOAD);
  const [status, setStatus] = useState("idle");
  const [responseBody, setResponseBody] = useState("");
  const [busy, setBusy] = useState(false);

  // TODO: Persist the last payload/signature so the lab rehydrates across refreshes.
  // TODO: Capture response time for quick side-by-side comparisons during onboarding.
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
    <main className="lab">
      <header className="lab__header">
        <p className="lab__eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="lab__lede">{copy.lede}</p>
      </header>

      <section className="lab__panel">
        <h2>{copy.panels.request.title}</h2>
        <label className="lab__field">
          {copy.panels.request.signatureLabel}
          <input
            value={signature}
            onChange={(event) => setSignature(event.target.value)}
            placeholder={copy.panels.request.signaturePlaceholder}
          />
        </label>
        <label className="lab__field">
          {copy.panels.request.payloadLabel}
          <textarea
            value={payload}
            onChange={(event) => setPayload(event.target.value)}
            rows={10}
          />
          <span className="lab__hint">{copy.panels.request.payloadHint}</span>
        </label>
        <button type="button" onClick={sendWebhook} disabled={busy}>
          {busy ? copy.panels.request.sendingButton : copy.panels.request.sendButton}
        </button>
        <div className="lab__status">
          {copy.panels.request.statusPrefix} {status}
        </div>
      </section>

      <section className="lab__panel">
        <h2>{copy.panels.response.title}</h2>
        {responseBody ? (
          <pre className="lab__response">{responseBody}</pre>
        ) : (
          <p className="lab__empty">{copy.panels.response.empty}</p>
        )}
      </section>

      <style jsx>{`
        .lab {
          --lab-bg: #f7f2e9;
          --lab-ink: #241f1a;
          --lab-accent: #a04c2b;
          --lab-panel: #fff8ef;
          --lab-border: #e6d3c1;
          --lab-shadow: rgba(36, 31, 26, 0.08);
          min-height: 100vh;
          padding: 2.5rem 2rem 4rem;
          color: var(--lab-ink);
          background: radial-gradient(circle at top right, #fff1de 0%, #f7f2e9 52%, #efe4d6 100%);
          font-family: "Sora", "Avenir Next", "Trebuchet MS", sans-serif;
          display: grid;
          gap: 1.75rem;
        }

        .lab__header {
          max-width: 720px;
          animation: labFade 420ms ease-out;
        }

        .lab__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.72rem;
          margin: 0 0 0.5rem;
          color: var(--lab-accent);
        }

        .lab__lede {
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

        .lab__panel {
          background: var(--lab-panel);
          border: 1px solid var(--lab-border);
          border-radius: 18px;
          padding: 1.5rem;
          box-shadow: 0 12px 28px var(--lab-shadow);
          display: grid;
          gap: 0.85rem;
          animation: labRise 520ms ease-out;
        }

        .lab__field {
          display: grid;
          gap: 0.5rem;
          font-size: 0.95rem;
        }

        input,
        textarea {
          border: 1px solid var(--lab-border);
          border-radius: 12px;
          padding: 0.65rem 0.75rem;
          font-size: 0.95rem;
          font-family: "Sora", "Avenir Next", "Trebuchet MS", sans-serif;
          background: #fffdf9;
          color: var(--lab-ink);
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
          background: var(--lab-accent);
          color: #fff7ee;
          cursor: pointer;
          width: fit-content;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .lab__status {
          font-size: 0.9rem;
          color: #6d6055;
        }

        .lab__response {
          margin: 0;
          padding: 1rem;
          border-radius: 12px;
          background: #1f1a16;
          color: #f9f2e7;
          font-size: 0.9rem;
          overflow-x: auto;
        }

        .lab__empty {
          margin: 0;
          color: #6d6055;
        }

        @keyframes labFade {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes labRise {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 720px) {
          .lab {
            padding: 2rem 1.5rem 3rem;
          }
        }
      `}</style>
    </main>
  );
}
