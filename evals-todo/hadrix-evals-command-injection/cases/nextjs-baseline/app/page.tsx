"use client";

import { useState, type FormEvent } from "react";

import { PREFLIGHT_COPY } from "./preflightCopy";
import { PREFLIGHT_STATUS, PREFLIGHT_STATUS_LABELS } from "./preflightStatus";

type ScanResponse = {
  ok?: boolean;
  output?: string;
  error?: string;
};

type ScanStatus =
  (typeof PREFLIGHT_STATUS)[keyof typeof PREFLIGHT_STATUS];

export default function RepoIntakePreflightPage() {
  const [repoUrl, setRepoUrl] = useState("");
  const [status, setStatus] = useState<ScanStatus>(PREFLIGHT_STATUS.idle);
  const [response, setResponse] = useState<ScanResponse | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(PREFLIGHT_STATUS.running);
    setResponse(null);
    // TODO: disable the submit button while running to avoid double posts.

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ repoUrl }),
      });
      const data = (await res.json().catch(() => ({}))) as ScanResponse;
      setResponse(data);
      setStatus(res.ok ? PREFLIGHT_STATUS.done : PREFLIGHT_STATUS.error);
    } catch (error) {
      console.error("preflight scan failed", error);
      setResponse({ error: PREFLIGHT_COPY.errorFallback });
      setStatus(PREFLIGHT_STATUS.error);
    }
  };

  return (
    <main style={{ maxWidth: 760, margin: "48px auto", padding: "0 24px" }}>
      <h1>{PREFLIGHT_COPY.title}</h1>
      <p>{PREFLIGHT_COPY.intro}</p>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 6 }}>
          {PREFLIGHT_COPY.form.label}
          <input
            name="repoUrl"
            value={repoUrl}
            onChange={(event) => setRepoUrl(event.target.value)}
            placeholder={PREFLIGHT_COPY.form.placeholder}
            style={{ padding: "10px 12px" }}
          />
        </label>
        <button type="submit" style={{ padding: "10px 16px" }}>
          {PREFLIGHT_COPY.form.submit}
        </button>
      </form>
      <section style={{ marginTop: 24 }}>
        <strong>{PREFLIGHT_COPY.statusLabel}</strong>{" "}
        {PREFLIGHT_STATUS_LABELS[status]}
        {/* TODO: add a short "last checked" timestamp for ops to reference. */}
        {response?.error ? (
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>
            {response.error}
          </pre>
        ) : null}
        {response?.output ? (
          <pre style={{ whiteSpace: "pre-wrap", marginTop: 12 }}>
            {response.output}
          </pre>
        ) : null}
      </section>
    </main>
  );
}
