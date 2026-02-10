import { CreateProjectForm } from "../../components/CreateProjectForm";
import { INTAKE_DESK_COPY } from "../../constants/intakeDeskCopy";
import { INTAKE_DESK_NOTES } from "../../constants/intakeDeskNotes";

export default function ProjectIntakeDeskPage() {
  const deskNotes = INTAKE_DESK_NOTES.slice(0, INTAKE_DESK_NOTES.length - 1);

  return (
    <main style={{ padding: "2.5rem", fontFamily: "\"Avenir Next\", \"Helvetica\", sans-serif", color: "#1f2a33" }}>
      <header style={{ marginBottom: "2rem", maxWidth: "44rem" }}>
        <p style={{ letterSpacing: "0.2em", textTransform: "uppercase", color: "#536471", fontSize: "0.75rem" }}>
          {INTAKE_DESK_COPY.eyebrow}
        </p>
        <h1 style={{ margin: "0.4rem 0 0.6rem" }}>{INTAKE_DESK_COPY.title}</h1>
        <p style={{ color: "#5a6a75" }}>{INTAKE_DESK_COPY.lede}</p>
      </header>

      <div
        style={{
          display: "grid",
          gap: "1.5rem",
          gridTemplateColumns: "minmax(0, 1fr)",
          maxWidth: "58rem"
        }}
      >
        <section
          style={{
            padding: "1.5rem",
            borderRadius: "16px",
            border: "1px solid #e2e8ee",
            background: "linear-gradient(140deg, #f6fbff 0%, #ffffff 60%)"
          }}
        >
          <CreateProjectForm />
        </section>
        <aside
          style={{
            padding: "1.25rem",
            borderRadius: "16px",
            border: "1px solid #e3e7eb",
            background: "#ffffff"
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1rem" }}>{INTAKE_DESK_COPY.sidebarTitle}</h2>
          <ul style={{ margin: "0.85rem 0 0", paddingLeft: "1.25rem", color: "#5a6a75" }}>
            {deskNotes.map((item) => (
              <li key={item} style={{ marginBottom: "0.5rem" }}>
                {item}
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </main>
  );
}
