import { fetchExternal } from "../lib/http";
import { partnerStatusCopy } from "./partnerStatusCopy";
import type { PartnerStatusSnapshot } from "./partnerStatusTypes";

const PARTNER_STATUS_URL = "https://status.partner.local/pulse";

export default async function PartnerStatusPulsePage() {
  const snapshot: PartnerStatusSnapshot = {
    targetUrl: PARTNER_STATUS_URL,
    statusLabel: "Unavailable",
    statusCode: "n/a",
    payloadPreview: "",
  };
  // TODO: cache the last successful snapshot so we do not blank the panel on transient errors.
  // TODO: add a simple "last updated" timestamp for the support shift handoff notes.

  try {
    const response = await fetchExternal(PARTNER_STATUS_URL);
    snapshot.statusCode = String(response.status);
    snapshot.statusLabel = response.ok ? "Online" : "Degraded";
    snapshot.payloadPreview = await response.text();
  } catch (error) {
    snapshot.statusLabel = "Error";
    snapshot.payloadPreview = error instanceof Error ? error.message : "Unknown error";
  }

  return (
    <main style={{ padding: "32px", fontFamily: "system-ui, sans-serif" }}>
      <h1>{partnerStatusCopy.title}</h1>
      <p>{partnerStatusCopy.description}</p>

      <section style={{ marginTop: "16px" }}>
        <div>
          {partnerStatusCopy.labels.target}: {snapshot.targetUrl}
        </div>
        <div>
          {partnerStatusCopy.labels.status}: {snapshot.statusLabel}
        </div>
        <div>
          {partnerStatusCopy.labels.http}: {snapshot.statusCode}
        </div>
      </section>

      {snapshot.payloadPreview && (
        <section style={{ marginTop: "16px" }}>
          <h2>{partnerStatusCopy.payloadTitle}</h2>
          <pre
            style={{
              padding: "12px",
              background: "#f5f5f5",
              borderRadius: "6px",
              whiteSpace: "pre-wrap",
            }}
          >
            {snapshot.payloadPreview}
          </pre>
        </section>
      )}
    </main>
  );
}
