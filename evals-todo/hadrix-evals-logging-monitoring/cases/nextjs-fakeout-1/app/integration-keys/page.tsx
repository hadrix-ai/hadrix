"use client";

import { useState } from "react";

import { INTEGRATION_KEY_DESK_CONFIG } from "./integrationKeyDeskConfig";
import { INTEGRATION_KEY_DESK_COPY } from "./integrationKeyDeskCopy";

type TokenIssueResult = {
  status: number;
  payload: Record<string, unknown>;
};

async function readJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return { error: "invalid json" };
  }
}

export default function IntegrationKeyDeskPage() {
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TokenIssueResult | null>(null);
  const {
    eyebrow,
    title,
    lede,
    userIdLabel,
    userIdPlaceholder,
    submitIdle,
    submitBusy,
    latestResponseTitle,
    latestResponseEmpty
  } = INTEGRATION_KEY_DESK_COPY;
  const { tokenEndpoint, headerKeys, contentTypes } = INTEGRATION_KEY_DESK_CONFIG;

  const issueToken = async () => {
    setBusy(true);
    // TODO: capture request duration for the response panel.
    // TODO: support issuing multiple tokens in a single request.
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        [headerKeys.contentType]: contentTypes.json,
        [headerKeys.userId]: userId
      }
    });
    const payload = await readJson(response);
    setResult({ status: response.status, payload });
    setBusy(false);
  };

  return (
    <main className="desk">
      <header>
        <p className="desk__eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="desk__lede">{lede}</p>
      </header>

      <section className="desk__panel">
        <label className="desk__field">
          {userIdLabel}
          <input
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            placeholder={userIdPlaceholder}
            required
          />
        </label>
        <button type="button" onClick={issueToken} disabled={busy || !userId.trim()}>
          {busy ? submitBusy : submitIdle}
        </button>
      </section>

      <section className="desk__panel">
        <h2>{latestResponseTitle}</h2>
        <pre>{result ? JSON.stringify(result, null, 2) : latestResponseEmpty}</pre>
      </section>

      <style jsx>{`
        .desk {
          min-height: 100vh;
          padding: 2.5rem 2rem 4rem;
          background: radial-gradient(circle at top, #f9f7f2, #e8e2d6 55%, #d8d1c3);
          color: #2b2620;
          font-family: "Georgia", "Times New Roman", serif;
          display: grid;
          gap: 1.5rem;
        }

        header {
          max-width: 720px;
        }

        .desk__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 0.7rem;
          margin: 0 0 0.6rem;
          color: #8b5d3b;
        }

        .desk__lede {
          margin: 0.75rem 0 0;
        }

        .desk__panel {
          background: #ffffff;
          border: 1px solid #e4dac9;
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 8px 24px rgba(43, 38, 32, 0.08);
          display: grid;
          gap: 0.85rem;
        }

        .desk__field {
          display: grid;
          gap: 0.4rem;
          font-size: 0.95rem;
        }

        input {
          padding: 0.5rem 0.65rem;
          border-radius: 10px;
          border: 1px solid #d7c8b3;
          font-size: 0.95rem;
        }

        button {
          width: fit-content;
          padding: 0.55rem 1.25rem;
          border-radius: 999px;
          border: 1px solid #2b2620;
          background: #2b2620;
          color: #fef8f0;
          cursor: pointer;
          font-weight: 600;
          letter-spacing: 0.02em;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        pre {
          background: #f8f4ed;
          border-radius: 12px;
          padding: 0.9rem;
          white-space: pre-wrap;
          word-break: break-word;
        }
      `}</style>
    </main>
  );
}
