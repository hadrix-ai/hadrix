"use client";

import { useState } from "react";

import { createApiTokenAction } from "@/app/actions/createApiToken";
import { DEVELOPER_CONSOLE_COPY } from "./consoleCopy";
import { requestTokenFromApi } from "./consoleRequests";

export default function DeveloperAccessConsolePage() {
  const copy = DEVELOPER_CONSOLE_COPY;
  const [authToken, setAuthToken] = useState("");
  const [apiLabel, setApiLabel] = useState("");
  const [status, setStatus] = useState("idle");
  const [issuedToken, setIssuedToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // TODO: Persist the last-used label so ops don't have to retype it every time.

  const requestToken = async () => {
    setBusy(true);
    setStatus("requesting token...");
    setIssuedToken(null);

    try {
      const data = await requestTokenFromApi(authToken, apiLabel);
      setIssuedToken(data.token ?? null);
      setStatus(data.error ? `error: ${data.error}` : "token issued");
    } catch (error) {
      setStatus("request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="console">
      <header className="console__header">
        <p className="console__eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="console__lede">{copy.lede}</p>
      </header>

      <section className="console__panel">
        <div>
          <h2>{copy.panels.manual.title}</h2>
          <p className="console__description">{copy.panels.manual.description}</p>
        </div>
        <form action={createApiTokenAction} className="console__form">
          <label className="console__field">
            {copy.panels.manual.userLabel}
            <input name="userId" placeholder={copy.panels.manual.userPlaceholder} />
          </label>
          <label className="console__field">
            {copy.panels.manual.labelLabel}
            <input name="label" placeholder={copy.panels.manual.labelPlaceholder} />
          </label>
          <button type="submit">{copy.panels.manual.submitLabel}</button>
        </form>
      </section>

      <section className="console__panel">
        <div>
          <h2>{copy.panels.endpoint.title}</h2>
          <p className="console__description">{copy.panels.endpoint.description}</p>
        </div>
        <label className="console__field">
          {copy.panels.endpoint.tokenLabel}
          <input
            value={authToken}
            onChange={(event) => setAuthToken(event.target.value)}
            placeholder={copy.panels.endpoint.tokenPlaceholder}
          />
        </label>
        <label className="console__field">
          {copy.panels.manual.labelLabel}
          <input
            value={apiLabel}
            onChange={(event) => setApiLabel(event.target.value)}
            placeholder={copy.panels.manual.labelPlaceholder}
          />
        </label>
        <button type="button" onClick={requestToken} disabled={busy}>
          {copy.panels.endpoint.submitLabel}
        </button>
        <div className="console__status">
          {copy.panels.endpoint.statusPrefix} {status}
        </div>
        <div className="console__token">
          <span>{copy.panels.endpoint.resultLabel}:</span>
          {/* TODO: Show when the token was minted once we capture the response metadata. */}
          <span>{issuedToken ?? "none yet"}</span>
        </div>
      </section>

      <style jsx>{`
        .console {
          --console-bg: #f3f0ea;
          --console-ink: #262019;
          --console-accent: #6d5a48;
          --console-panel: #fff9f1;
          --console-border: #e2d7c8;
          min-height: 100vh;
          padding: 2.5rem 2rem 4rem;
          display: grid;
          gap: 1.5rem;
          background: radial-gradient(circle at top left, #fff8ee 0%, #f3f0ea 55%, #efe6da 100%);
          color: var(--console-ink);
          font-family: "Iowan Old Style", "Palatino", serif;
        }

        .console__header {
          max-width: 640px;
          display: grid;
          gap: 0.5rem;
        }

        .console__eyebrow {
          margin: 0;
          font-size: 0.75rem;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--console-accent);
        }

        .console__lede {
          margin: 0;
          font-size: 1.05rem;
        }

        .console__panel {
          background: var(--console-panel);
          border: 1px solid var(--console-border);
          border-radius: 16px;
          padding: 1.5rem;
          display: grid;
          gap: 1rem;
          box-shadow: 0 12px 32px rgba(38, 32, 25, 0.08);
        }

        .console__description {
          margin: 0.35rem 0 0;
          color: rgba(38, 32, 25, 0.75);
        }

        .console__form {
          display: grid;
          gap: 0.75rem;
        }

        .console__field {
          display: grid;
          gap: 0.35rem;
          font-size: 0.9rem;
        }

        input {
          border: 1px solid var(--console-border);
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
          background: var(--console-accent);
          color: #fff;
          font-weight: 600;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .console__status {
          font-size: 0.9rem;
          color: rgba(38, 32, 25, 0.75);
        }

        .console__token {
          display: grid;
          gap: 0.25rem;
          font-size: 0.95rem;
          background: #f7efe2;
          border-radius: 12px;
          padding: 0.75rem;
          border: 1px dashed var(--console-border);
        }
      `}</style>
    </main>
  );
}
