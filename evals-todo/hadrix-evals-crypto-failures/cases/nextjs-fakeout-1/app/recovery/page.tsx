"use client";

import { useState } from "react";

import { RECOVERY_DESK_COPY } from "./recoveryCopy";
import { RECOVERY_DESK_ENDPOINT, RECOVERY_STATUS_MESSAGES } from "./recoveryDeskConfig";

export default function AccountRecoveryDeskPage() {
  const copy = RECOVERY_DESK_COPY;
  const [sessionToken, setSessionToken] = useState("");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(RECOVERY_STATUS_MESSAGES.idle);
  const [busy, setBusy] = useState(false);

  const requestReset = async () => {
    setBusy(true);
    setStatusMessage(RECOVERY_STATUS_MESSAGES.requesting);

    try {
      const response = await fetch(RECOVERY_DESK_ENDPOINT, {
        method: "POST",
        headers: sessionToken
          ? {
              Authorization: `Bearer ${sessionToken}`
            }
          : undefined
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatusMessage(data.error ? `error: ${data.error}` : RECOVERY_STATUS_MESSAGES.failed);
        return;
      }

      setIssuedToken(data.token ?? null);
      setStatusMessage(RECOVERY_STATUS_MESSAGES.issued);
    } catch (error) {
      setStatusMessage(RECOVERY_STATUS_MESSAGES.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="recovery">
      <header className="recovery__header">
        <p className="recovery__eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="recovery__lede">{copy.lede}</p>
      </header>

      <section className="recovery__panel">
        <label className="recovery__field">
          {copy.tokenLabel}
          <input
            value={sessionToken}
            onChange={(event) => setSessionToken(event.target.value)}
            placeholder={copy.tokenPlaceholder}
          />
        </label>
        <button type="button" onClick={requestReset} disabled={busy}>
          {copy.submitLabel}
        </button>
        <div className="recovery__status">
          {copy.statusPrefix}: {statusMessage}
        </div>
        <div className="recovery__token">
          <span>{copy.resultLabel}:</span>
          <span>{issuedToken ?? "none yet"}</span>
        </div>
      </section>

      <style jsx>{`
        .recovery {
          --recovery-bg: #f6f4f0;
          --recovery-ink: #1d1c19;
          --recovery-accent: #b1563a;
          --recovery-panel: #fff7ec;
          --recovery-border: #e1d4c2;
          min-height: 100vh;
          padding: 2.5rem 2rem 4rem;
          display: grid;
          gap: 1.5rem;
          background: radial-gradient(circle at top right, #fff6e5 0%, #f6f4f0 55%, #efe7dc 100%);
          color: var(--recovery-ink);
          font-family: "Iowan Old Style", "Palatino", serif;
        }

        .recovery__header {
          max-width: 620px;
          display: grid;
          gap: 0.6rem;
        }

        .recovery__eyebrow {
          margin: 0;
          font-size: 0.75rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--recovery-accent);
        }

        .recovery__lede {
          margin: 0;
          font-size: 1.05rem;
        }

        .recovery__panel {
          background: var(--recovery-panel);
          border: 1px solid var(--recovery-border);
          border-radius: 16px;
          padding: 1.5rem;
          display: grid;
          gap: 1rem;
          box-shadow: 0 12px 32px rgba(29, 28, 25, 0.08);
          max-width: 520px;
        }

        .recovery__field {
          display: grid;
          gap: 0.35rem;
          font-size: 0.95rem;
        }

        input {
          border: 1px solid var(--recovery-border);
          border-radius: 10px;
          padding: 0.6rem 0.7rem;
          font-size: 0.95rem;
          background: #fff;
          color: inherit;
        }

        button {
          justify-self: start;
          border: none;
          border-radius: 999px;
          padding: 0.6rem 1.4rem;
          background: var(--recovery-accent);
          color: #fff;
          font-weight: 600;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .recovery__status {
          font-size: 0.9rem;
          color: rgba(29, 28, 25, 0.7);
        }

        .recovery__token {
          display: grid;
          gap: 0.25rem;
          font-size: 0.95rem;
          background: #f8ecdc;
          border-radius: 12px;
          padding: 0.75rem;
          border: 1px dashed var(--recovery-border);
        }
      `}</style>
    </main>
  );
}
