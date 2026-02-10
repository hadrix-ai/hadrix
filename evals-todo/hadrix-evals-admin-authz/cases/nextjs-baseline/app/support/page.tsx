"use client";

import { useState } from "react";

import { SUPPORT_CONSOLE_COPY } from "./supportCopy";
import type { DeleteResponse, SupportUserRow, UsersResponse } from "./supportTypes";

function buildHeaders(token: string, mfa: string) {
  const headers: Record<string, string> = {};
  const trimmedToken = token.trim();
  const trimmedMfa = mfa.trim();

  if (trimmedToken) {
    headers.authorization = `Bearer ${trimmedToken}`;
  }

  if (trimmedMfa) {
    headers["x-mfa"] = trimmedMfa;
  }

  return headers;
}

export default function SupportConsolePage() {
  const copy = SUPPORT_CONSOLE_COPY;
  const [token, setToken] = useState("");
  const [mfa, setMfa] = useState("");
  const [users, setUsers] = useState<SupportUserRow[]>([]);
  const [status, setStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState("");
  // TODO: Track the last successful roster refresh to show staleness in the header.
  // TODO: Swap delete-id input for a roster picker when the list grows.

  const loadUsers = async () => {
    setBusy(true);
    setStatus("loading users...");

    try {
      const response = await fetch("/api/admin/users", {
        headers: buildHeaders(token, mfa)
      });
      const data = (await response.json()) as UsersResponse;

      setUsers(data.users ?? []);
      setStatus(data.error ? `error: ${data.error}` : `loaded ${data.users?.length ?? 0} users`);
    } catch (error) {
      setUsers([]);
      setStatus("failed to load users");
    } finally {
      setBusy(false);
    }
  };

  const removeUser = async (userId: string) => {
    if (!userId) {
      setStatus("missing target user id");
      return;
    }

    setBusy(true);
    setStatus("deleting user...");

    try {
      const response = await fetch(`/api/admin/users/${userId}`,
        {
          method: "DELETE",
          headers: buildHeaders(token, "")
        }
      );
      const data = (await response.json()) as DeleteResponse;
      setStatus(data.error ? `error: ${data.error}` : "delete request sent");
    } catch (error) {
      setStatus("failed to delete user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="console">
      <header className="console__header">
        <p className="console__eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="console__lede">
          {copy.lede}
        </p>
      </header>

      <section className="console__panel">
        <h2>{copy.panels.session.title}</h2>
        <label className="console__field">
          {copy.panels.session.tokenLabel}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={copy.panels.session.tokenPlaceholder}
          />
        </label>
        <label className="console__field">
          {copy.panels.session.mfaLabel}
          <input
            value={mfa}
            onChange={(event) => setMfa(event.target.value)}
            placeholder={copy.panels.session.mfaPlaceholder}
          />
        </label>
        <button type="button" onClick={loadUsers} disabled={busy}>
          {copy.panels.session.loadButton}
        </button>
        <div className="console__status">
          {copy.panels.session.statusPrefix} {status}
        </div>
      </section>

      <section className="console__panel">
        <h2>{copy.panels.roster.title}</h2>
        <ul>
          {users.length === 0 ? (
            <li>{copy.panels.roster.emptyLabel}</li>
          ) : (
            users.map((user) => (
              <li key={user.id}>
                <span className="console__user-email">{user.email}</span>
                <span className="console__user-meta">{user.role}</span>
                <span className="console__user-meta">{user.org_id ?? "no-org"}</span>
                <span className="console__user-id">{user.id}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="console__panel">
        <h2>{copy.panels.removal.title}</h2>
        <label className="console__field">
          {copy.panels.removal.targetLabel}
          <input
            value={deleteId}
            onChange={(event) => setDeleteId(event.target.value)}
            placeholder={copy.panels.removal.targetPlaceholder}
          />
        </label>
        <button type="button" onClick={() => removeUser(deleteId)} disabled={busy}>
          {copy.panels.removal.deleteButton}
        </button>
      </section>

      <style jsx>{`
        .console {
          --console-bg: #f4ede3;
          --console-ink: #1f1a14;
          --console-accent: #c06b2c;
          --console-panel: #fff7ee;
          --console-border: #e4d2bf;
          --console-shadow: rgba(31, 26, 20, 0.08);
          min-height: 100vh;
          padding: 2.5rem 2rem 4rem;
          color: var(--console-ink);
          background: radial-gradient(circle at top left, #fff4e5 0%, #f4ede3 52%, #ebdfd1 100%);
          font-family: "Goudy Old Style", "Palatino", "Book Antiqua", serif;
          display: grid;
          gap: 1.75rem;
        }

        .console__header {
          max-width: 720px;
          animation: consoleFade 420ms ease-out;
        }

        .console__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 0.75rem;
          margin: 0 0 0.5rem;
          color: var(--console-accent);
        }

        .console__lede {
          max-width: 560px;
          font-size: 1.05rem;
          margin: 0.75rem 0 0;
        }

        .console__panel {
          background: var(--console-panel);
          border: 1px solid var(--console-border);
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 10px 30px var(--console-shadow);
          display: grid;
          gap: 0.85rem;
          animation: consoleRise 520ms ease-out;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.6rem);
        }

        h2 {
          margin: 0;
          font-size: 1.4rem;
        }

        ul {
          list-style: none;
          margin: 0.5rem 0 0;
          padding: 0;
          display: grid;
          gap: 0.5rem;
        }

        li {
          display: grid;
          grid-template-columns: minmax(140px, 1fr) auto auto minmax(140px, 1fr);
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          border-radius: 10px;
          background: #f9f2e8;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 0.55rem 1.4rem;
          background: var(--console-accent);
          color: white;
          font-weight: 600;
          cursor: pointer;
          transition: transform 150ms ease, box-shadow 150ms ease;
        }

        button:disabled {
          opacity: 0.6;
          cursor: default;
          box-shadow: none;
        }

        button:not(:disabled):hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 18px rgba(192, 107, 44, 0.3);
        }

        input {
          border: 1px solid var(--console-border);
          border-radius: 10px;
          padding: 0.55rem 0.7rem;
          background: #fffdf9;
          font-family: inherit;
        }

        .console__field {
          display: grid;
          gap: 0.35rem;
        }

        .console__status {
          font-size: 0.95rem;
          color: #5a4b3d;
        }

        .console__user-email {
          font-weight: 600;
        }

        .console__user-meta {
          font-size: 0.9rem;
          color: #5a4b3d;
        }

        .console__user-id {
          font-family: "Courier New", monospace;
          font-size: 0.85rem;
          color: #6d5b4a;
          justify-self: end;
        }

        @keyframes consoleFade {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes consoleRise {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}
