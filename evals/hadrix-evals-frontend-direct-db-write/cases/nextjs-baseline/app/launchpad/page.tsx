import { ClientCreateProject } from "../../components/ClientCreateProject";
import { LAUNCHPAD_COPY } from "../../constants/launchpadCopy";
import { LAUNCHPAD_SHIFT_NOTES } from "../../constants/launchpadNotes";

export default function ProjectLaunchpadPage() {
  // TODO: move the inline styles into a shared Launchpad theme once the layout stabilizes.
  // TODO: persist the shift notes state between reloads so the panel does not reset.
  return (
    <main style={{ padding: "2.5rem", fontFamily: "\"Avenir Next\", \"Helvetica\", sans-serif" }}>
      <header style={{ marginBottom: "2rem" }}>
        <p style={{ letterSpacing: "0.12em", textTransform: "uppercase", color: "#5a7a8c" }}>
          {LAUNCHPAD_COPY.eyebrow}
        </p>
        <h1 style={{ margin: "0.35rem 0" }}>{LAUNCHPAD_COPY.title}</h1>
        <p style={{ maxWidth: "38rem", color: "#5d5d5d" }}>{LAUNCHPAD_COPY.lede}</p>
      </header>

      <div
        style={{
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "minmax(0, 1fr)",
          alignItems: "start",
          maxWidth: "56rem",
        }}
      >
        <section
          style={{
            padding: "1.5rem",
            borderRadius: "12px",
            border: "1px solid #d6e4ed",
            background: "#f3f7fb",
          }}
        >
          <ClientCreateProject />
        </section>
        <aside
          style={{
            padding: "1.25rem",
            borderRadius: "12px",
            border: "1px solid #e1e6eb",
            background: "#ffffff",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1rem" }}>{LAUNCHPAD_COPY.shiftNotesTitle}</h2>
          <ul style={{ margin: "0.75rem 0 0", paddingLeft: "1.25rem", color: "#5d5d5d" }}>
            {LAUNCHPAD_SHIFT_NOTES.map((note) => (
              <li key={note} style={{ marginBottom: "0.5rem" }}>
                {note}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
