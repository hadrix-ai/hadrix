"use client";

import { useState } from "react";

import { TRIAGE_COPY } from "../../../constants/triageCopy";
import type { ProjectSnapshotApiRecord, ProjectSnapshotApiResponse } from "../../../types/api/projectSnapshotApi";

export default function ProjectTriageSnapshotPage({ params }: { params: { id: string } }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState(TRIAGE_COPY.status.idle);
  const [busy, setBusy] = useState(false);
  const [project, setProject] = useState<ProjectSnapshotApiRecord | null>(null);
  // TODO: Hydrate the session token from the incident sidebar once ticket context lands.
  // TODO: Track last snapshot refresh time so agents can spot stale reads.

  const loadSnapshot = async () => {
    const projectId = params.id?.trim();
    if (!projectId) {
      setStatus(TRIAGE_COPY.status.missingProjectId);
      return;
    }

    const headers: Record<string, string> = {};
    const trimmedToken = token.trim();
    if (trimmedToken) {
      headers.authorization = `Bearer ${trimmedToken}`;
    }

    setBusy(true);
    setStatus(TRIAGE_COPY.status.loading);

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, { headers });
      const payload = (await response.json()) as ProjectSnapshotApiResponse;

      setProject(payload.project ?? null);
      if (payload.error) {
        setStatus(`${TRIAGE_COPY.status.errorPrefix}${payload.error}`);
      } else if (payload.project) {
        setStatus(TRIAGE_COPY.status.loaded);
      } else {
        setStatus(TRIAGE_COPY.status.notFound);
      }
    } catch {
      setProject(null);
      setStatus(TRIAGE_COPY.status.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="triage">
      <header className="triage__header">
        <p className="triage__eyebrow">{TRIAGE_COPY.eyebrow}</p>
        <h1>{TRIAGE_COPY.title}</h1>
        <p className="triage__lede">{TRIAGE_COPY.lede}</p>
      </header>

      <section className="triage__panel">
        <h2>{TRIAGE_COPY.sections.lookup}</h2>
        <div className="triage__field">
          <span className="triage__label">{TRIAGE_COPY.labels.projectId}</span>
          <span className="triage__value">{params.id}</span>
        </div>
        <label className="triage__field">
          <span className="triage__label">{TRIAGE_COPY.labels.sessionToken}</span>
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={TRIAGE_COPY.placeholders.sessionToken}
          />
        </label>
        <button type="button" onClick={loadSnapshot} disabled={busy}>
          {busy ? TRIAGE_COPY.actions.loading : TRIAGE_COPY.actions.load}
        </button>
        <div className="triage__status">
          {TRIAGE_COPY.labels.status} {status}
        </div>
      </section>

      <section className="triage__panel">
        <h2>{TRIAGE_COPY.sections.summary}</h2>
        {project ? (
          <div className="triage__summary">
            <div>
              <span className="triage__label">{TRIAGE_COPY.labels.name}</span>
              <span className="triage__value">{String(project.name ?? "")}</span>
            </div>
            <div>
              <span className="triage__label">{TRIAGE_COPY.labels.org}</span>
              <span className="triage__value">
                {String(project.org_id ?? TRIAGE_COPY.fallbacks.org)}
              </span>
            </div>
            <div>
              <span className="triage__label">{TRIAGE_COPY.labels.description}</span>
              <span className="triage__value">
                {String(project.description ?? TRIAGE_COPY.fallbacks.description)}
              </span>
            </div>
            <div>
              <span className="triage__label">{TRIAGE_COPY.labels.htmlNote}</span>
              <span className="triage__value">
                {String(project.description_html ?? TRIAGE_COPY.fallbacks.htmlNote)}
              </span>
            </div>
          </div>
        ) : (
          <p className="triage__empty">{TRIAGE_COPY.fallbacks.emptyState}</p>
        )}
      </section>

      <style jsx>{`
        .triage {
          --triage-bg: #f3f7f4;
          --triage-panel: #fefcf7;
          --triage-ink: #151a1f;
          --triage-accent: #2a8d77;
          --triage-accent-strong: #1b6a59;
          --triage-border: rgba(21, 26, 31, 0.12);
          --triage-shadow: rgba(21, 26, 31, 0.08);
          min-height: 100vh;
          padding: 2.5rem 2rem 4rem;
          background: radial-gradient(circle at top left, #e6f5ef 0%, #f3f7f4 45%, #f7efe6 100%);
          color: var(--triage-ink);
          font-family: "Space Grotesk", "Helvetica Neue", sans-serif;
          display: grid;
          gap: 1.75rem;
        }

        .triage__header {
          max-width: 680px;
        }

        .triage__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 0.75rem;
          color: var(--triage-accent);
          margin: 0 0 0.5rem;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.75rem);
        }

        .triage__lede {
          margin: 0.75rem 0 0;
          max-width: 520px;
        }

        .triage__panel {
          background: var(--triage-panel);
          border: 1px solid var(--triage-border);
          border-radius: 18px;
          padding: 1.5rem;
          box-shadow: 0 12px 30px var(--triage-shadow);
          display: grid;
          gap: 0.85rem;
          animation: panelLift 0.55s ease both;
        }

        .triage__panel:nth-of-type(1) {
          animation-delay: 0.05s;
        }

        .triage__panel:nth-of-type(2) {
          animation-delay: 0.12s;
        }

        .triage__field {
          display: grid;
          gap: 0.35rem;
        }

        .triage__label {
          font-size: 0.75rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(21, 26, 31, 0.65);
        }

        .triage__value {
          font-weight: 600;
          word-break: break-word;
        }

        input {
          border: 1px solid var(--triage-border);
          border-radius: 10px;
          padding: 0.65rem 0.75rem;
          font-size: 0.95rem;
          background: #ffffff;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 0.65rem 1.4rem;
          background: var(--triage-accent);
          color: #fefcf7;
          font-weight: 600;
          cursor: pointer;
          width: fit-content;
          transition: background 0.2s ease, transform 0.2s ease;
        }

        button:disabled {
          background: rgba(42, 141, 119, 0.55);
          cursor: default;
          transform: none;
        }

        button:not(:disabled):hover {
          background: var(--triage-accent-strong);
          transform: translateY(-1px);
        }

        .triage__status {
          font-size: 0.9rem;
          color: rgba(21, 26, 31, 0.7);
        }

        .triage__summary {
          display: grid;
          gap: 0.7rem;
        }

        .triage__empty {
          margin: 0;
          color: rgba(21, 26, 31, 0.6);
        }

        @keyframes panelLift {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 720px) {
          .triage {
            padding: 2rem 1.5rem 3rem;
          }

          .triage__panel {
            padding: 1.25rem;
          }
        }
      `}</style>
    </main>
  );
}
