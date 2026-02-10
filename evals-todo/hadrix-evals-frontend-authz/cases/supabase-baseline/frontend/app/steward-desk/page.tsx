import { AdminUsers } from "@/admin/AdminUsers";
import { STEWARD_DESK_COPY } from "@/constants/stewardDeskCopy";
import { STEWARD_DESK_SHIFT_NOTES } from "@/mock/stewardDeskShiftNotes";

export default function MemberStewardDeskPage() {
  return (
    <main className="steward">
      <header className="steward__header">
        <p className="steward__eyebrow">{STEWARD_DESK_COPY.eyebrow}</p>
        <h1>{STEWARD_DESK_COPY.title}</h1>
        <p className="steward__lede">{STEWARD_DESK_COPY.lede}</p>
      </header>

      <section className="steward__panel">
        <h2>{STEWARD_DESK_COPY.rosterTitle}</h2>
        {/* TODO: Add quick roster filters once team tags are wired in. */}
        <AdminUsers />
      </section>

      <section className="steward__panel steward__panel--notes">
        <h2>{STEWARD_DESK_COPY.notesTitle}</h2>
        {/* TODO: Persist shift notes to a lightweight handoff store. */}
        <ul>
          {STEWARD_DESK_SHIFT_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <style jsx>{`
        .steward {
          --steward-ink: #1b1a17;
          --steward-accent: #2a6b5f;
          --steward-panel: #f5f1ea;
          min-height: 100vh;
          padding: 2.5rem 2rem 3rem;
          font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
          color: var(--steward-ink);
          background: radial-gradient(circle at top right, #f7efe3 0%, #efe7da 55%, #e7dfd2 100%);
          display: grid;
          gap: 1.5rem;
        }

        .steward__header {
          max-width: 720px;
        }

        .steward__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.2em;
          font-size: 0.75rem;
          margin: 0 0 0.5rem;
          color: var(--steward-accent);
        }

        .steward__lede {
          margin: 0.75rem 0 0;
          font-size: 1.05rem;
        }

        .steward__panel {
          background: var(--steward-panel);
          border: 1px solid #e0d6c8;
          border-radius: 18px;
          padding: 1.5rem;
          display: grid;
          gap: 0.75rem;
        }

        .steward__panel--notes {
          background: #efe7dc;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.7rem);
        }

        h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        ul {
          margin: 0;
          padding-left: 1.2rem;
          color: #4f473f;
        }
      `}</style>
    </main>
  );
}
