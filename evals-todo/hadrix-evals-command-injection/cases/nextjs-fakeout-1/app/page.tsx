"use client";

import { useState } from "react";

import { DEFAULT_REPO_URL, SCAN_STATUS, type ScanStatus } from "./partnerIntakeConfig";
import { PARTNER_INTAKE_COPY } from "./partnerIntakeCopy";

export default function PartnerRepoIntakePage() {
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO_URL);
  const [status, setStatus] = useState<ScanStatus>(SCAN_STATUS.idle);
  const [output, setOutput] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  // TODO: Persist the last successful repo URL in localStorage for quick retries.
  // TODO: Add a copy-to-clipboard button for the scan output panel.

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(SCAN_STATUS.pending);
    setErrorMessage("");
    setOutput("");

    try {
      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setStatus(SCAN_STATUS.error);
        setErrorMessage(
          String(data?.error ?? PARTNER_INTAKE_COPY.errorResponseFallback)
        );
        return;
      }

      setStatus(SCAN_STATUS.done);
      setOutput(String(data?.output ?? ""));
    } catch (error) {
      setStatus(SCAN_STATUS.error);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : PARTNER_INTAKE_COPY.errorResponseFallback
        );
    }
  }

  return (
    <main style={{ padding: "32px", fontFamily: "system-ui, sans-serif" }}>
      <h1>{PARTNER_INTAKE_COPY.title}</h1>
      <p>{PARTNER_INTAKE_COPY.intro}</p>

      <form onSubmit={handleSubmit} style={{ marginTop: "16px" }}>
        <label htmlFor="repo-url">{PARTNER_INTAKE_COPY.repoUrlLabel}</label>
        <div style={{ display: "flex", gap: "12px", marginTop: "8px" }}>
          <input
            id="repo-url"
            name="repoUrl"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder={PARTNER_INTAKE_COPY.repoUrlPlaceholder}
            style={{ flex: 1, padding: "8px" }}
          />
          <button type="submit" disabled={status === SCAN_STATUS.pending}>
            {status === SCAN_STATUS.pending
              ? PARTNER_INTAKE_COPY.checkingButton
              : PARTNER_INTAKE_COPY.runButton}
          </button>
        </div>
      </form>

      {status === SCAN_STATUS.error && (
        <p style={{ color: "#b00020", marginTop: "12px" }}>
          {errorMessage || PARTNER_INTAKE_COPY.errorDisplayFallback}
        </p>
      )}

      {status === SCAN_STATUS.done && output && (
        <section style={{ marginTop: "16px" }}>
          <h2>{PARTNER_INTAKE_COPY.outputTitle}</h2>
          <pre
            style={{
              padding: "12px",
              background: "#f5f5f5",
              borderRadius: "6px",
              whiteSpace: "pre-wrap",
            }}
          >
            {output}
          </pre>
        </section>
      )}
    </main>
  );
}
