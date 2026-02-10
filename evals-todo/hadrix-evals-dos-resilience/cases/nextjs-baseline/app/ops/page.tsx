"use client";

import { useState } from "react";

import { OPS_CONSOLE_COPY } from "./opsConsoleCopy";
import {
  OpsConsoleProjectApiRow,
  OpsConsoleProjectsApiResponse,
  OpsConsoleScanApiResponse,
  OpsConsoleUploadApiResponse,
  OpsConsoleUserApiRow,
  OpsConsoleUsersApiResponse
} from "./types/api/opsConsoleApiTypes";

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

export default function ReliabilityOpsPage() {
  const [token, setToken] = useState("");
  const [mfa, setMfa] = useState("");
  const [status, setStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [users, setUsers] = useState<OpsConsoleUserApiRow[]>([]);
  const [projects, setProjects] = useState<OpsConsoleProjectApiRow[]>([]);
  const [repoUrl, setRepoUrl] = useState("/tmp/ops-demo-repo.git");
  const [scanOutput, setScanOutput] = useState("");
  const [uploadBody, setUploadBody] = useState("incident notes: login spike from 10.0.0.0/8");
  const [uploadStatus, setUploadStatus] = useState("");

  const loadUsers = async () => {
    setBusy(true);
    setStatus("loading roster...");

    try {
      const response = await fetch("/api/admin/users", {
        headers: buildHeaders(token, mfa)
      });
      const data = (await response.json()) as OpsConsoleUsersApiResponse;
      setUsers(data.users ?? []);
      setStatus(data.error ? `error: ${data.error}` : `loaded ${data.users?.length ?? 0} users`);
    } catch (error) {
      setUsers([]);
      setStatus("failed to load roster");
    } finally {
      setBusy(false);
    }
  };

  const loadProjects = async () => {
    setBusy(true);
    setStatus("loading projects...");
    setUsers([]);

    try {
      const response = await fetch("/api/projects", {
        headers: buildHeaders(token, "")
      });
      const data = (await response.json()) as OpsConsoleProjectsApiResponse;
      setProjects(data.projects ?? []);
      setStatus(data.error ? `error: ${data.error}` : `loaded ${data.projects?.length ?? 0} projects`);
    } catch (error) {
      setProjects([]);
      setStatus("failed to load projects");
    } finally {
      setBusy(false);
    }
  };

  const runRepoScan = async () => {
    if (!repoUrl.trim()) {
      setStatus("missing repo url");
      return;
    }

    setBusy(true);
    setStatus("running repo scan...");

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json", ...buildHeaders(token, "") },
        body: JSON.stringify({ repoUrl })
      });
      const data = (await response.json()) as OpsConsoleScanApiResponse;
      setScanOutput(data.output ?? "");
      setStatus(data.error ? `error: ${data.error}` : "scan complete");
    } catch (error) {
      setScanOutput("");
      setStatus("scan failed");
    } finally {
      setBusy(false);
    }
  };

  const uploadArtifact = async () => {
    setBusy(true);
    setStatus("uploading artifact...");

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: { "content-type": "text/plain" },
        body: uploadBody
      });
      const data = (await response.json()) as OpsConsoleUploadApiResponse;
      if (typeof data.bytes === "number") {
        setUploadStatus(`stored ${data.bytes} bytes`);
      } else if (data.ok) {
        setUploadStatus("upload accepted");
      } else {
        setUploadStatus("upload failed");
      }
      setStatus("upload finished");
    } catch (error) {
      setUploadStatus("upload failed");
      setStatus("upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="ops">
      <header className="ops__header">
        <p className="ops__eyebrow">{OPS_CONSOLE_COPY.eyebrow}</p>
        <h1>{OPS_CONSOLE_COPY.title}</h1>
        <p className="ops__lede">{OPS_CONSOLE_COPY.lede}</p>
      </header>

      <section className="ops__panel">
        <h2>{OPS_CONSOLE_COPY.panels.session}</h2>
        <label className="ops__field">
          {OPS_CONSOLE_COPY.labels.token}
          <input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder={OPS_CONSOLE_COPY.placeholders.token}
          />
        </label>
        <label className="ops__field">
          {OPS_CONSOLE_COPY.labels.mfa}
          <input
            value={mfa}
            onChange={(event) => setMfa(event.target.value)}
            placeholder={OPS_CONSOLE_COPY.placeholders.mfa}
          />
        </label>
        <div className="ops__status">Status: {status}</div>
      </section>

      <section className="ops__panel">
        <div className="ops__panel-header">
          <h2>{OPS_CONSOLE_COPY.panels.adminRoster}</h2>
          <button type="button" onClick={loadUsers} disabled={busy}>
            {OPS_CONSOLE_COPY.buttons.loadRoster}
          </button>
        </div>
        <ul className="ops__list">
          {users.length === 0 ? (
            <li className="ops__empty">No users loaded yet.</li>
          ) : (
            users.map((user) => (
              <li key={user.id} className="ops__row">
                <span className="ops__strong">{user.email}</span>
                <span className="ops__meta">{user.role}</span>
                <span className="ops__meta">{user.org_id ?? "no-org"}</span>
                <span className="ops__id">{user.id}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="ops__panel">
        <div className="ops__panel-header">
          <h2>{OPS_CONSOLE_COPY.panels.orgProjects}</h2>
          <button type="button" onClick={loadProjects} disabled={busy}>
            {OPS_CONSOLE_COPY.buttons.loadProjects}
          </button>
        </div>
        <ul className="ops__list">
          {projects.length === 0 ? (
            <li className="ops__empty">No projects loaded yet.</li>
          ) : (
            projects.map((project) => (
              <li key={project.id} className="ops__row">
                <span className="ops__strong">{project.name}</span>
                <span className="ops__meta">{project.org_id ?? "no-org"}</span>
                <span className="ops__id">{project.id}</span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="ops__panel">
        <div className="ops__panel-header">
          <h2>{OPS_CONSOLE_COPY.panels.repoScan}</h2>
          <button type="button" onClick={runRepoScan} disabled={busy}>
            {OPS_CONSOLE_COPY.buttons.runScan}
          </button>
        </div>
        <label className="ops__field">
          {OPS_CONSOLE_COPY.labels.repoUrl}
          <input
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder={OPS_CONSOLE_COPY.placeholders.repoUrl}
          />
        </label>
        <pre className="ops__output">{scanOutput || "scan output will appear here"}</pre>
      </section>

      <section className="ops__panel">
        <div className="ops__panel-header">
          <h2>{OPS_CONSOLE_COPY.panels.incidentUpload}</h2>
          <button type="button" onClick={uploadArtifact} disabled={busy}>
            {OPS_CONSOLE_COPY.buttons.uploadArtifact}
          </button>
        </div>
        <label className="ops__field">
          {OPS_CONSOLE_COPY.labels.artifactNotes}
          <textarea
            rows={5}
            value={uploadBody}
            onChange={(event) => setUploadBody(event.target.value)}
          />
        </label>
        <div className="ops__status">Upload: {uploadStatus || "pending"}</div>
      </section>

      <style jsx>{`
        .ops {
          --ops-bg: #0f1a22;
          --ops-panel: #1a2631;
          --ops-border: #2c3b4a;
          --ops-ink: #f7f3e8;
          --ops-muted: #b7c4d1;
          --ops-accent: #f7b32b;
          --ops-accent-2: #59c3c3;
          min-height: 100vh;
          padding: 2.5rem clamp(1.5rem, 4vw, 4rem) 4rem;
          background: radial-gradient(circle at top, #17212b 0%, #0f1a22 55%, #0a1218 100%);
          color: var(--ops-ink);
          font-family: "Space Grotesk", "Futura", "Avenir Next", sans-serif;
          display: grid;
          gap: 1.75rem;
        }

        .ops__header {
          max-width: 680px;
        }

        .ops__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.3em;
          font-size: 0.7rem;
          color: var(--ops-accent);
          margin: 0 0 0.6rem;
        }

        h1 {
          margin: 0;
          font-size: clamp(2.1rem, 4vw, 2.9rem);
        }

        .ops__lede {
          margin: 0.8rem 0 0;
          color: var(--ops-muted);
          max-width: 520px;
        }

        .ops__panel {
          background: var(--ops-panel);
          border: 1px solid var(--ops-border);
          border-radius: 18px;
          padding: 1.5rem;
          display: grid;
          gap: 1rem;
          box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        }

        .ops__panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
        }

        h2 {
          margin: 0;
          font-size: 1.2rem;
        }

        .ops__field {
          display: grid;
          gap: 0.45rem;
          font-size: 0.9rem;
          color: var(--ops-muted);
        }

        input,
        textarea {
          background: #0b131a;
          border: 1px solid var(--ops-border);
          border-radius: 12px;
          padding: 0.65rem 0.75rem;
          color: var(--ops-ink);
          font-size: 0.95rem;
        }

        textarea {
          resize: vertical;
        }

        button {
          border: none;
          border-radius: 999px;
          padding: 0.55rem 1.2rem;
          background: linear-gradient(120deg, var(--ops-accent), var(--ops-accent-2));
          color: #0b131a;
          font-weight: 600;
          cursor: pointer;
        }

        button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .ops__status {
          font-size: 0.85rem;
          color: var(--ops-muted);
        }

        .ops__list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: grid;
          gap: 0.5rem;
        }

        .ops__row {
          display: grid;
          grid-template-columns: 1.6fr 0.6fr 0.6fr 1fr;
          gap: 0.75rem;
          align-items: center;
          padding: 0.5rem 0.75rem;
          background: rgba(7, 12, 16, 0.6);
          border-radius: 12px;
          border: 1px solid rgba(44, 59, 74, 0.5);
          font-size: 0.85rem;
        }

        .ops__strong {
          color: var(--ops-ink);
        }

        .ops__meta {
          color: var(--ops-muted);
        }

        .ops__id {
          font-family: "IBM Plex Mono", "Courier New", monospace;
          color: var(--ops-muted);
          font-size: 0.75rem;
        }

        .ops__empty {
          color: var(--ops-muted);
          padding: 0.4rem 0.2rem;
        }

        .ops__output {
          margin: 0;
          background: #0b131a;
          border-radius: 12px;
          border: 1px solid var(--ops-border);
          padding: 0.75rem;
          min-height: 120px;
          color: var(--ops-muted);
          font-family: "IBM Plex Mono", "Courier New", monospace;
          font-size: 0.8rem;
          white-space: pre-wrap;
        }

        @media (max-width: 720px) {
          .ops__row {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </main>
  );
}
