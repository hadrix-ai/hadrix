"use client";

import { useState } from "react";

import { TRIAGE_COPY } from "./triageCopy";
import type { TriageUserRow, TriageUsersResponse } from "./triageTypes";

function buildHeaders(token: string, role: string, mfa: string) {
  const headers: Record<string, string> = {};
  const trimmedToken = token.trim();
  const trimmedRole = role.trim();
  const trimmedMfa = mfa.trim();

  if (trimmedToken) {
    headers.authorization = `Bearer ${trimmedToken}`;
  }

  if (trimmedRole) {
    headers["x-user-role"] = trimmedRole;
  }

  if (trimmedMfa) {
    headers["x-mfa"] = trimmedMfa;
  }

  return headers;
}

export default function TriageRosterPage() {
  const copy = TRIAGE_COPY;
  const [token, setToken] = useState("");
  const [role, setRole] = useState("support");
  const [mfa, setMfa] = useState("");
  const [users, setUsers] = useState<TriageUserRow[]>([]);
  const [status, setStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  // TODO: persist the last-used triage headers for shift handoffs.
  // TODO: surface request latency in the status line for quick triage context.

  const loadRoster = async () => {
    setBusy(true);
    setStatus("loading roster...");

    try {
      const response = await fetch("/api/admin/users", {
        headers: buildHeaders(token, role, mfa)
      });
      const data = (await response.json()) as TriageUsersResponse;

      setUsers(data.users ?? []);
      setStatus(data.error ? `error: ${data.error}` : `loaded ${data.users?.length ?? 0} users`);
    } catch {
      setUsers([]);
      setStatus("failed to load roster");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="triage">
      <header>
        <p className="triage__eyebrow">{copy.eyebrow}</p>
        <h1>{copy.title}</h1>
        <p className="triage__lede">{copy.lede}</p>
      </header>

      <section className="triage__panel">
        <label className="triage__field">
          {copy.panels.session.tokenLabel}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={copy.panels.session.tokenPlaceholder}
          />
        </label>
        <label className="triage__field">
          {copy.panels.session.roleLabel}
          <input
            value={role}
            onChange={(event) => setRole(event.target.value)}
            placeholder={copy.panels.session.rolePlaceholder}
          />
        </label>
        <label className="triage__field">
          {copy.panels.session.mfaLabel}
          <input
            value={mfa}
            onChange={(event) => setMfa(event.target.value)}
            placeholder={copy.panels.session.mfaPlaceholder}
          />
        </label>
        <button type="button" onClick={loadRoster} disabled={busy}>
          {busy ? copy.panels.session.loadingButton : copy.panels.session.loadButton}
        </button>
        <div className="triage__status">
          {copy.panels.session.statusPrefix} {status}
        </div>
      </section>

      <section className="triage__panel">
        <h2>{copy.panels.roster.title}</h2>
        <ul>
          {users.length === 0 ? (
            <li>{copy.panels.roster.emptyLabel}</li>
          ) : (
            users.map((user) => (
              <li key={user.id}>
                <span className="triage__user-email">{user.email}</span>
                <span className="triage__user-meta">{user.role}</span>
                <span className="triage__user-meta">{user.org_id ?? "no-org"}</span>
                <span className="triage__user-id">{user.id}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <style jsx>{`
        .triage {
          min-height: 100vh;
          padding: 2.5rem 2rem 4rem;
          background: linear-gradient(135deg, #fdf9f3, #f1efe9);
          color: #2b2520;
          font-family: "Georgia", "Times New Roman", serif;
          display: grid;
          gap: 1.5rem;
        }

        header {
          max-width: 680px;
        }

        .triage__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.7rem;
          margin: 0 0 0.5rem;
          color: #99623d;
        }

        .triage__lede {
          margin: 0.75rem 0 0;
        }

        .triage__panel {
          background: #ffffff;
          border: 1px solid #e4d7c7;
          border-radius: 14px;
          padding: 1.5rem;
          box-shadow: 0 8px 22px rgba(43, 37, 32, 0.08);
          display: grid;
          gap: 0.9rem;
        }

        .triage__field {
          display: grid;
          gap: 0.4rem;
          font-size: 0.95rem;
        }

        input {
          padding: 0.5rem 0.75rem;
          border-radius: 8px;
          border: 1px solid #d8c6b2;
        }

        button {
          width: fit-content;
          padding: 0.5rem 1rem;
          border: none;
          border-radius: 999px;
          background: #cb7a3c;
          color: #fffaf3;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        ul {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 0.5rem;
        }

        li {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 120px 120px 1fr;
          gap: 0.75rem;
          padding: 0.35rem 0.5rem;
          border-bottom: 1px dashed #e4d7c7;
        }

        .triage__user-email {
          font-weight: 600;
        }

        .triage__user-meta {
          color: #6a5c4c;
          font-size: 0.9rem;
        }

        .triage__user-id {
          color: #8d7864;
          font-size: 0.85rem;
        }

        .triage__status {
          font-size: 0.9rem;
          color: #5d4e40;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.4rem);
        }

        h2 {
          margin: 0;
        }
      `}</style>
    </main>
  );
}
