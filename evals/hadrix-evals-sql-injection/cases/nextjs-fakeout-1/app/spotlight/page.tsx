"use client";

import { useState } from "react";
import { PROJECT_SPOTLIGHT_COPY } from "@/constants/projectSpotlightCopy";
import {
  ProjectSpotlightApiResponse,
  ProjectSpotlightProjectApiModel
} from "@/types/api/projectSpotlightApi";

function buildHeaders(token: string) {
  const headers: Record<string, string> = {};
  const trimmedToken = token.trim();

  if (trimmedToken) {
    headers.authorization = `Bearer ${trimmedToken}`;
  }

  return headers;
}

export default function ProjectSpotlightPage() {
  const [token, setToken] = useState("");
  const [projectId, setProjectId] = useState("");
  const [project, setProject] = useState<ProjectSpotlightProjectApiModel | null>(null);
  const [status, setStatus] = useState(PROJECT_SPOTLIGHT_COPY.status.idle);
  const [busy, setBusy] = useState(false);

  const loadSpotlight = async () => {
    const trimmedId = projectId.trim();

    if (!trimmedId) {
      setStatus(PROJECT_SPOTLIGHT_COPY.status.missingId);
      return;
    }

    // TODO: Persist the last successful spotlight id for quick resume after refresh.
    // TODO: Add a lightweight "recent ids" picker once we have real ops usage data.
    setBusy(true);
    setStatus(PROJECT_SPOTLIGHT_COPY.status.loading);

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(trimmedId)}`, {
        headers: buildHeaders(token)
      });
      const data = (await response.json()) as ProjectSpotlightApiResponse;
      const projectData = data?.project ?? null;

      setProject(projectData);
      if (projectData) {
        setStatus(PROJECT_SPOTLIGHT_COPY.status.ready);
      } else {
        setStatus(data?.error ?? PROJECT_SPOTLIGHT_COPY.status.noProjectFallback);
      }
    } catch (error) {
      setProject(null);
      setStatus(PROJECT_SPOTLIGHT_COPY.status.failed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="spotlight">
      <header className="spotlight__header">
        <p className="spotlight__eyebrow">{PROJECT_SPOTLIGHT_COPY.header.eyebrow}</p>
        <h1>{PROJECT_SPOTLIGHT_COPY.header.title}</h1>
        <p className="spotlight__lede">
          {PROJECT_SPOTLIGHT_COPY.header.lede}
        </p>
        <div className="spotlight__status">{status}</div>
      </header>

      <section className="spotlight__panel">
        <h2>{PROJECT_SPOTLIGHT_COPY.session.title}</h2>
        <label className="spotlight__field">
          {PROJECT_SPOTLIGHT_COPY.session.tokenLabel}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={PROJECT_SPOTLIGHT_COPY.session.tokenPlaceholder}
          />
        </label>
      </section>

      <section className="spotlight__panel">
        <h2>{PROJECT_SPOTLIGHT_COPY.lookup.title}</h2>
        <label className="spotlight__field">
          {PROJECT_SPOTLIGHT_COPY.lookup.projectIdLabel}
          <input
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder={PROJECT_SPOTLIGHT_COPY.lookup.projectIdPlaceholder}
          />
        </label>
        <button type="button" onClick={loadSpotlight} disabled={busy}>
          {busy ? PROJECT_SPOTLIGHT_COPY.lookup.buttonBusy : PROJECT_SPOTLIGHT_COPY.lookup.buttonIdle}
        </button>
      </section>

      <section className="spotlight__panel">
        <h2>{PROJECT_SPOTLIGHT_COPY.snapshot.title}</h2>
        {project ? (
          <div className="spotlight__card">
            <div className="spotlight__title">
              {project.name ?? PROJECT_SPOTLIGHT_COPY.snapshot.untitled}
            </div>
            <div className="spotlight__meta">
              ID: {project.id ?? PROJECT_SPOTLIGHT_COPY.snapshot.unknown}
            </div>
            <div className="spotlight__meta">
              Org: {project.org_id ?? PROJECT_SPOTLIGHT_COPY.snapshot.unknown}
            </div>
            <p className="spotlight__body">
              {project.description ?? PROJECT_SPOTLIGHT_COPY.snapshot.noDescription}
            </p>
            {project.description_html ? (
              <div className="spotlight__hint">{PROJECT_SPOTLIGHT_COPY.snapshot.htmlHint}</div>
            ) : null}
          </div>
        ) : (
          <p className="spotlight__empty">{PROJECT_SPOTLIGHT_COPY.snapshot.empty}</p>
        )}
      </section>

      <style jsx>{`
        .spotlight {
          min-height: 100vh;
          padding: 2.5rem clamp(1.5rem, 3vw, 3.5rem) 4rem;
          display: grid;
          gap: 1.5rem;
          color: #1c1c23;
          background: radial-gradient(circle at top left, #f7f2ff 0%, #efe9f9 45%, #e6ecf5 100%);
          font-family: "Sora", "Segoe UI", sans-serif;
        }

        .spotlight__header {
          max-width: 720px;
          animation: spotlightFade 420ms ease-out;
        }

        .spotlight__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.32em;
          font-size: 0.65rem;
          margin: 0 0 0.5rem;
          color: #5a4b7a;
        }

        .spotlight__lede {
          margin: 0.75rem 0 0;
          font-size: 1.05rem;
        }

        .spotlight__status {
          margin-top: 1rem;
          padding: 0.5rem 0.75rem;
          background: rgba(90, 75, 122, 0.12);
          border-left: 3px solid #5a4b7a;
          font-size: 0.95rem;
        }

        .spotlight__panel {
          background: #ffffff;
          border: 1px solid #d8d4e8;
          border-radius: 16px;
          padding: 1.5rem;
          box-shadow: 0 16px 32px rgba(23, 18, 32, 0.08);
          display: grid;
          gap: 0.9rem;
          animation: spotlightRise 520ms ease-out;
        }

        .spotlight__field {
          display: grid;
          gap: 0.4rem;
          font-size: 0.95rem;
        }

        input {
          border-radius: 9px;
          border: 1px solid #c9c3de;
          padding: 0.55rem 0.75rem;
        }

        button {
          width: fit-content;
          border: none;
          border-radius: 999px;
          padding: 0.55rem 1.2rem;
          background: #5a4b7a;
          color: #f8f6ff;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .spotlight__card {
          display: grid;
          gap: 0.4rem;
          background: #f4f1fb;
          border-radius: 12px;
          padding: 1rem;
        }

        .spotlight__title {
          font-size: 1.1rem;
          font-weight: 600;
        }

        .spotlight__meta {
          font-size: 0.9rem;
          color: #57506a;
        }

        .spotlight__body {
          margin: 0.4rem 0 0;
        }

        .spotlight__hint {
          font-size: 0.85rem;
          color: #7a6b94;
        }

        .spotlight__empty {
          color: #6a637d;
        }

        @keyframes spotlightFade {
          from {
            opacity: 0;
            transform: translateY(8px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes spotlightRise {
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
