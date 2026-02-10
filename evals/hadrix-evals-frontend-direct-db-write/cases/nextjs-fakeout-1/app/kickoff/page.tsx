"use client";

import { ClientCreateProject } from "../../components/ClientCreateProject";
import { KICKOFF_COPY } from "./kickoffCopy";
import { KICKOFF_PREFLIGHT_CHECKS } from "./kickoffPreflight";

export default function ProjectKickoffPage() {
  // TODO: Replace static checklist copy with the ops feed once it lands.
  // TODO: Tighten header spacing on small screens after launch.
  return (
    <main style={{ maxWidth: "760px", margin: "40px auto", padding: "0 24px" }}>
      <header>
        <p style={{ textTransform: "uppercase", letterSpacing: "0.08em", color: "#666", fontSize: "12px" }}>
          {KICKOFF_COPY.eyebrow}
        </p>
        <h1 style={{ margin: "8px 0 12px" }}>{KICKOFF_COPY.title}</h1>
        <p style={{ color: "#4b4b4b" }}>{KICKOFF_COPY.description}</p>
        <ul style={{ margin: "16px 0 0", paddingLeft: "18px", color: "#595959" }}>
          {KICKOFF_PREFLIGHT_CHECKS.map((check) => (
            <li key={check.id} style={{ marginBottom: "6px" }}>
              <strong>{check.label}</strong> — {check.detail}
            </li>
          ))}
        </ul>
        <p style={{ marginTop: "12px", fontSize: "13px", color: "#7a7a7a" }}>{KICKOFF_COPY.helper}</p>
      </header>
      <section style={{ marginTop: "24px" }}>
        <ClientCreateProject />
      </section>
    </main>
  );
}
