"use client";

import { useState } from "react";

import { PROJECT_BRIEF_COPY } from "../../../constants/projectBriefCopy";
import {
  ProjectBriefApiRecord,
  ProjectBriefApiResponse
} from "../../../types/api/projectBriefApi";

export default function ProjectBriefPage({ params }: { params: { id: string } }) {
  const [token, setToken] = useState("");
  const [status, setStatus] = useState(PROJECT_BRIEF_COPY.status.ready);
  const [busy, setBusy] = useState(false);
  const [project, setProject] = useState<ProjectBriefApiRecord | null>(null);

  const loadBrief = async () => {
    // TODO: Align projectId normalization with the ticketing importer.
    const projectId = params.id?.trim();
    if (!projectId) {
      setStatus(PROJECT_BRIEF_COPY.status.missingProjectId);
      return;
    }

    const headers: Record<string, string> = {};
    const trimmedToken = token.trim();
    if (trimmedToken) {
      headers.authorization = `Bearer ${trimmedToken}`;
    }

    setBusy(true);
    setStatus(PROJECT_BRIEF_COPY.status.loading);

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
        headers
      });
      const payload = (await response.json()) as ProjectBriefApiResponse;

      setProject(payload.project ?? null);
      if (payload.error) {
        setStatus(`${PROJECT_BRIEF_COPY.status.errorPrefix}${payload.error}`);
      } else if (payload.project) {
        setStatus(PROJECT_BRIEF_COPY.status.loaded);
      } else {
        setStatus(PROJECT_BRIEF_COPY.status.notFound);
      }
    } catch (error) {
      setProject(null);
      setStatus(PROJECT_BRIEF_COPY.status.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="brief">
      <header className="brief__header">
        <p className="brief__eyebrow">{PROJECT_BRIEF_COPY.eyebrow}</p>
        <h1>{PROJECT_BRIEF_COPY.title}</h1>
        <p className="brief__lede">{PROJECT_BRIEF_COPY.lede}</p>
      </header>

      <section className="brief__panel">
        <h2>{PROJECT_BRIEF_COPY.sections.lookup}</h2>
        <div className="brief__field">
          <span className="brief__label">{PROJECT_BRIEF_COPY.labels.projectId}</span>
          <span className="brief__value">{params.id}</span>
        </div>
        <label className="brief__field">
          <span className="brief__label">{PROJECT_BRIEF_COPY.labels.sessionToken}</span>
          {/* TODO: Replace manual token entry with a session picker once support auth is wired. */}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={PROJECT_BRIEF_COPY.placeholders.sessionToken}
          />
        </label>
        <button type="button" onClick={loadBrief} disabled={busy}>
          {busy ? PROJECT_BRIEF_COPY.actions.loading : PROJECT_BRIEF_COPY.actions.load}
        </button>
        <div className="brief__status">
          {PROJECT_BRIEF_COPY.labels.status} {status}
        </div>
      </section>

      <section className="brief__panel">
        <h2>{PROJECT_BRIEF_COPY.sections.summary}</h2>
        {project ? (
          <div className="brief__summary">
            <div>
              <span className="brief__label">{PROJECT_BRIEF_COPY.labels.name}</span>
              <span className="brief__value">{project.name}</span>
            </div>
            <div>
              <span className="brief__label">{PROJECT_BRIEF_COPY.labels.org}</span>
              <span className="brief__value">
                {project.org_id ?? PROJECT_BRIEF_COPY.fallbacks.org}
              </span>
            </div>
            <div>
              <span className="brief__label">{PROJECT_BRIEF_COPY.labels.description}</span>
              <span className="brief__value">
                {project.description ?? PROJECT_BRIEF_COPY.fallbacks.description}
              </span>
            </div>
            <div>
              <span className="brief__label">{PROJECT_BRIEF_COPY.labels.htmlNote}</span>
              <span className="brief__value">
                {project.description_html ?? PROJECT_BRIEF_COPY.fallbacks.htmlNote}
              </span>
            </div>
          </div>
        ) : (
          <p className="brief__empty">{PROJECT_BRIEF_COPY.fallbacks.emptyState}</p>
        )}
      </section>

      <style jsx>{`
        .brief {
          --brief-bg: #f3f2ef;
          --brief-panel: #fffaf3;
          --brief-ink: #1e1b17;
          --brief-accent: #ce6d2f;
          --brief-border: #e4d7c6;
          --brief-shadow: rgba(30, 27, 23, 0.08);
          min-height: 100vh;
          padding: 2.5rem 2rem 4rem;
          background: radial-gradient(circle at top right, #fff1df 0%, #f3f2ef 55%, #eee4d4 100%);
          color: var(--brief-ink);
          font-family: "Gill Sans", "Trebuchet MS", sans-serif;
          display: grid;
          gap: 1.75rem;
        }

        .brief__header {
          max-width: 640px;
        }

        .brief__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 0.75rem;
          color: var(--brief-accent);
          margin: 0 0 0.5rem;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.6rem);
        }

        .brief__lede {
          margin: 0.75rem 0 0;
          max-width: 480px;
        }

        .brief__panel {
          background: var(--brief-panel);
          border: 1px solid var(--brief-border);
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 12px 30px var(--brief-shadow);
          display: grid;
          gap: 0.85rem;
        }

        .brief__field {
          display: grid;
          gap: 0.35rem;
        }

        .brief__label {
          font-size: 0.8rem;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(30, 27, 23, 0.7);
        }

        .brief__value {
          font-weight: 600;
        }

        input {
          border: 1px solid var(--brief-border);
          border-radius: 10px;
          padding: 0.6rem 0.75rem;
          font-size: 0.95rem;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 0.65rem 1.4rem;
          background: var(--brief-accent);
          color: #fffaf3;
          font-weight: 600;
          cursor: pointer;
          width: fit-content;
        }

        button[disabled] {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .brief__status {
          font-size: 0.9rem;
          color: rgba(30, 27, 23, 0.7);
        }

        .brief__summary {
          display: grid;
          gap: 0.75rem;
        }

        .brief__empty {
          margin: 0;
          color: rgba(30, 27, 23, 0.7);
        }
      `}</style>
    </main>
  );
}
