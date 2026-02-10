"use client";

import { useState } from "react";

import { projectAtlasCopy } from "../../config/projectAtlasCopy";
import type {
  ProjectAtlasProjectApiRecord,
  ProjectAtlasProjectDetailApiResponse,
  ProjectAtlasProjectListApiResponse
} from "../../types/api/projectAtlasApi";

function buildHeaders(token: string) {
  const headers: Record<string, string> = {};
  const trimmedToken = token.trim();

  if (trimmedToken) {
    headers.authorization = `Bearer ${trimmedToken}`;
  }

  return headers;
}

export default function ProjectAtlasPage() {
  const [token, setToken] = useState("");
  const [filter, setFilter] = useState("");
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectAtlasProjectApiRecord[]>([]);
  const [projectDetail, setProjectDetail] = useState<ProjectAtlasProjectApiRecord | null>(null);
  const [status, setStatus] = useState("Ready when you are.");
  const [busy, setBusy] = useState(false);
  // TODO: Persist the last-used roster filter per session so the panel feels less stateless.
  // TODO: Replace manual project id entry with a quick picker tied to the roster list.

  const loadRoster = async () => {
    setBusy(true);
    setStatus("Loading roster...");

    try {
      const params = filter ? `?filter=${encodeURIComponent(filter)}` : "";
      const response = await fetch(`/api/projects${params}`, {
        headers: buildHeaders(token)
      });
      const data = (await response.json()) as ProjectAtlasProjectListApiResponse;
      setProjects(data.projects ?? []);
      setProjectDetail(null);
      setStatus(data.error ? `Roster error: ${data.error}` : `Loaded ${data.projects?.length ?? 0} projects.`);
    } catch (error) {
      setProjects([]);
      setProjectDetail(null);
      setStatus("Failed to load roster.");
    } finally {
      setBusy(false);
    }
  };

  const loadDetail = async (id: string) => {
    if (!id) {
      setStatus("Project id is required.");
      return;
    }

    setBusy(true);
    setStatus("Loading project detail...");

    try {
      const response = await fetch(`/api/projects/${id}`, {
        headers: buildHeaders(token)
      });
      const data = (await response.json()) as ProjectAtlasProjectDetailApiResponse;
      setProjectDetail(data.project ?? null);
      setStatus(data.project ? "Detail loaded." : data.error ?? "No detail found.");
    } catch (error) {
      setProjectDetail(null);
      setStatus("Failed to load project detail.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="atlas">
      <header className="atlas__header">
        <p className="atlas__eyebrow">{projectAtlasCopy.eyebrow}</p>
        <h1>{projectAtlasCopy.title}</h1>
        <p className="atlas__lede">{projectAtlasCopy.lede}</p>
        <div className="atlas__status">{status}</div>
      </header>

      <section className="atlas__panel">
        <h2>{projectAtlasCopy.panels.session.title}</h2>
        <label className="atlas__field">
          {projectAtlasCopy.panels.session.tokenLabel}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={projectAtlasCopy.panels.session.tokenPlaceholder}
          />
        </label>
      </section>

      <section className="atlas__panel">
        <h2>{projectAtlasCopy.panels.roster.title}</h2>
        <label className="atlas__field">
          {projectAtlasCopy.panels.roster.filterLabel}
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={projectAtlasCopy.panels.roster.filterPlaceholder}
          />
        </label>
        <button type="button" onClick={loadRoster} disabled={busy}>
          {projectAtlasCopy.panels.roster.loadButton}
        </button>
        <div className="atlas__list">
          {projects.length === 0 ? (
            <p className="atlas__empty">No projects loaded yet.</p>
          ) : (
            projects.map((project) => (
              <div key={project.id ?? project.name} className="atlas__row">
                <div>
                  <div className="atlas__row-title">{project.name ?? "Untitled"}</div>
                  <div className="atlas__row-meta">{project.id}</div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const id = project.id ?? "";
                    setProjectId(id);
                    loadDetail(id);
                  }}
                  disabled={busy}
                >
                  Open
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="atlas__panel">
        <h2>{projectAtlasCopy.panels.detail.title}</h2>
        <label className="atlas__field">
          {projectAtlasCopy.panels.detail.idLabel}
          <input
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
            placeholder={projectAtlasCopy.panels.detail.idPlaceholder}
          />
        </label>
        <button type="button" onClick={() => loadDetail(projectId)} disabled={busy}>
          {projectAtlasCopy.panels.detail.loadButton}
        </button>
        <div className="atlas__detail">
          {projectDetail ? (
            <>
              <div className="atlas__detail-title">{projectDetail.name ?? "Untitled"}</div>
              <div className="atlas__detail-meta">Org: {projectDetail.org_id ?? "unknown"}</div>
              <p className="atlas__detail-body">{projectDetail.description ?? "No description."}</p>
            </>
          ) : (
            <p className="atlas__empty">Detail output will show here.</p>
          )}
        </div>
      </section>

      <style jsx>{`
        .atlas {
          --atlas-bg: #f6efe6;
          --atlas-ink: #1b2024;
          --atlas-accent: #d57c3a;
          --atlas-panel: #fff7ee;
          --atlas-border: #e8d6c5;
          --atlas-shadow: rgba(27, 32, 36, 0.12);
          min-height: 100vh;
          padding: 2.5rem clamp(1.5rem, 3vw, 3.5rem) 4rem;
          color: var(--atlas-ink);
          background: radial-gradient(circle at top left, #fff3e4 0%, #f6efe6 55%, #efe4d6 100%);
          font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
          display: grid;
          gap: 1.5rem;
        }

        .atlas__header {
          max-width: 760px;
          animation: atlasFade 420ms ease-out;
        }

        .atlas__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.3em;
          font-size: 0.7rem;
          margin: 0 0 0.5rem;
          color: var(--atlas-accent);
        }

        .atlas__lede {
          margin: 0.75rem 0 0;
          font-size: 1.05rem;
        }

        .atlas__status {
          margin-top: 1rem;
          padding: 0.5rem 0.75rem;
          border-left: 3px solid var(--atlas-accent);
          background: rgba(213, 124, 58, 0.12);
          font-size: 0.95rem;
        }

        .atlas__panel {
          background: var(--atlas-panel);
          border: 1px solid var(--atlas-border);
          border-radius: 18px;
          padding: 1.5rem;
          box-shadow: 0 16px 35px var(--atlas-shadow);
          display: grid;
          gap: 0.85rem;
          animation: atlasRise 520ms ease-out;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 4vw, 2.75rem);
        }

        h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        .atlas__field {
          display: grid;
          gap: 0.4rem;
          font-size: 0.95rem;
        }

        input {
          border-radius: 10px;
          border: 1px solid var(--atlas-border);
          padding: 0.65rem 0.75rem;
          font-size: 0.95rem;
          background: #fff;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 0.55rem 1.2rem;
          background: var(--atlas-accent);
          color: #fff;
          font-weight: 600;
          font-size: 0.95rem;
          cursor: pointer;
          align-self: start;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .atlas__list {
          display: grid;
          gap: 0.75rem;
        }

        .atlas__row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          padding: 0.75rem 0.85rem;
          border-radius: 12px;
          background: #fff;
          border: 1px solid var(--atlas-border);
        }

        .atlas__row-title {
          font-weight: 600;
        }

        .atlas__row-meta {
          font-size: 0.85rem;
          color: #5a6168;
        }

        .atlas__detail {
          border-radius: 14px;
          border: 1px dashed var(--atlas-border);
          padding: 1rem;
          background: rgba(255, 255, 255, 0.7);
        }

        .atlas__detail-title {
          font-weight: 600;
          font-size: 1.1rem;
        }

        .atlas__detail-meta {
          font-size: 0.85rem;
          color: #5a6168;
          margin-top: 0.2rem;
        }

        .atlas__detail-body {
          margin-top: 0.75rem;
        }

        .atlas__empty {
          margin: 0;
          color: #6b6f73;
        }

        @keyframes atlasFade {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes atlasRise {
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
