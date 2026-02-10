"use client";

import { useState, type FormEvent } from "react";

import { LAUNCHPAD_OPS_CONSOLE_CONFIG } from "../../config/launchpadOpsConsoleConfig";
import type {
  LaunchpadCreateProjectRequest,
  LaunchpadRequestResult,
  LaunchpadScanRequest
} from "../../types/api/launchpadOpsApi";

function formatResult(result: LaunchpadRequestResult | null) {
  if (!result) {
    return "";
  }
  return JSON.stringify(result, null, 2);
}

async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return { error: "invalid json" };
  }
}

export default function LaunchpadOpsConsolePage() {
  const { apiRoutes, sections, subtitle, title } = LAUNCHPAD_OPS_CONSOLE_CONFIG;

  const [sessionToken, setSessionToken] = useState("");
  // TODO: Cache the session token between refreshes for longer on-call shifts.

  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [projectDescriptionHtml, setProjectDescriptionHtml] = useState("");
  const [projectResult, setProjectResult] = useState<LaunchpadRequestResult | null>(null);
  const [projectBusy, setProjectBusy] = useState(false);

  const [repoUrl, setRepoUrl] = useState("");
  const [scanResult, setScanResult] = useState<LaunchpadRequestResult | null>(null);
  const [scanBusy, setScanBusy] = useState(false);

  const [tokenResult, setTokenResult] = useState<LaunchpadRequestResult | null>(null);
  const [tokenBusy, setTokenBusy] = useState(false);

  // TODO: Replace manual user id entry with a roster picker once ops directory is wired up.
  const [deleteUserId, setDeleteUserId] = useState("");
  const [deleteResult, setDeleteResult] = useState<LaunchpadRequestResult | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const authHeaders = sessionToken
    ? { Authorization: `Bearer ${sessionToken}` }
    : {};

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectBusy(true);
    const requestBody: LaunchpadCreateProjectRequest = {
      name: projectName,
      description: projectDescription,
      descriptionHtml: projectDescriptionHtml
    };
    const res = await fetch(apiRoutes.projects, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders
      },
      body: JSON.stringify(requestBody)
    });
    const payload = await readJson(res);
    setProjectResult({ status: res.status, payload });
    setProjectBusy(false);
  }

  async function handleScanRepo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setScanBusy(true);
    const requestBody: LaunchpadScanRequest = { repoUrl };
    const res = await fetch(apiRoutes.scan, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody)
    });
    const payload = await readJson(res);
    setScanResult({ status: res.status, payload });
    setScanBusy(false);
  }

  async function handleIssueToken() {
    setTokenBusy(true);
    const res = await fetch(apiRoutes.tokens, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...authHeaders
      }
    });
    const payload = await readJson(res);
    setTokenResult({ status: res.status, payload });
    setTokenBusy(false);
  }

  async function handleDeleteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteBusy(true);
    const res = await fetch(`${apiRoutes.adminUsers}/${deleteUserId}`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...authHeaders
      }
    });
    const payload = await readJson(res);
    setDeleteResult({ status: res.status, payload });
    setDeleteBusy(false);
  }

  return (
    <main style={{ padding: "2.5rem", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <h1>{title}</h1>
      <p>{subtitle}</p>

      <section style={{ marginTop: "2rem" }}>
        <h2>{sections.session.title}</h2>
        <p>{sections.session.description}</p>
        <input
          type="text"
          value={sessionToken}
          onChange={(event) => setSessionToken(event.target.value)}
          placeholder={sections.session.placeholder}
          style={{ width: "100%", padding: "0.5rem" }}
        />
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{sections.createProject.title}</h2>
        <form onSubmit={handleCreateProject} style={{ display: "grid", gap: "0.75rem" }}>
          <input
            type="text"
            value={projectName}
            onChange={(event) => setProjectName(event.target.value)}
            placeholder={sections.createProject.namePlaceholder}
            required
          />
          <textarea
            value={projectDescription}
            onChange={(event) => setProjectDescription(event.target.value)}
            placeholder={sections.createProject.descriptionPlaceholder}
            rows={3}
          />
          <textarea
            value={projectDescriptionHtml}
            onChange={(event) => setProjectDescriptionHtml(event.target.value)}
            placeholder={sections.createProject.htmlPlaceholder}
            rows={3}
          />
          <button type="submit" disabled={projectBusy}>
            {projectBusy ? sections.createProject.busyLabel : sections.createProject.submitLabel}
          </button>
        </form>
        {projectResult ? (
          <pre style={{ marginTop: "0.75rem" }}>{formatResult(projectResult)}</pre>
        ) : null}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{sections.scanRepo.title}</h2>
        <form onSubmit={handleScanRepo} style={{ display: "grid", gap: "0.75rem" }}>
          <input
            type="text"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder={sections.scanRepo.placeholder}
            required
          />
          <button type="submit" disabled={scanBusy}>
            {scanBusy ? sections.scanRepo.busyLabel : sections.scanRepo.submitLabel}
          </button>
        </form>
        {scanResult ? <pre style={{ marginTop: "0.75rem" }}>{formatResult(scanResult)}</pre> : null}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{sections.issueToken.title}</h2>
        <button type="button" onClick={handleIssueToken} disabled={tokenBusy}>
          {tokenBusy ? sections.issueToken.busyLabel : sections.issueToken.submitLabel}
        </button>
        {tokenResult ? (
          <pre style={{ marginTop: "0.75rem" }}>{formatResult(tokenResult)}</pre>
        ) : null}
      </section>

      <section style={{ marginTop: "2rem" }}>
        <h2>{sections.deleteUser.title}</h2>
        <form onSubmit={handleDeleteUser} style={{ display: "grid", gap: "0.75rem" }}>
          <input
            type="text"
            value={deleteUserId}
            onChange={(event) => setDeleteUserId(event.target.value)}
            placeholder={sections.deleteUser.placeholder}
            required
          />
          <button type="submit" disabled={deleteBusy}>
            {deleteBusy ? sections.deleteUser.busyLabel : sections.deleteUser.submitLabel}
          </button>
        </form>
        {deleteResult ? (
          <pre style={{ marginTop: "0.75rem" }}>{formatResult(deleteResult)}</pre>
        ) : null}
      </section>
    </main>
  );
}
