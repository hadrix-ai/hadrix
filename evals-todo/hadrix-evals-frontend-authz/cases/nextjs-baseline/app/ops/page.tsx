import { AdminUsers } from "@/components/AdminUsers";
import { OPS_ROSTER_COPY } from "@/constants/opsRosterCopy";
import { OPS_ROSTER_SHIFT_NOTES } from "@/constants/opsRosterNotes";

export default function WorkspaceOpsRosterPage() {
  return (
    <main className="ops">
      <header className="ops__header">
        <p className="ops__eyebrow">{OPS_ROSTER_COPY.eyebrow}</p>
        <h1>{OPS_ROSTER_COPY.title}</h1>
        <p className="ops__lede">{OPS_ROSTER_COPY.lede}</p>
      </header>

      <section className="ops__panel">
        <h2>{OPS_ROSTER_COPY.directoryTitle}</h2>
        <AdminUsers />
      </section>

      <section className="ops__panel ops__panel--notes">
        <h2>{OPS_ROSTER_COPY.shiftNotesTitle}</h2>
        <ul>
          {OPS_ROSTER_SHIFT_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <style jsx>{`
        .ops {
          --ops-ink: #1f1c18;
          --ops-accent: #d07333;
          --ops-panel: #fff6ee;
          --ops-border: #ead7c7;
          --ops-shadow: rgba(31, 28, 24, 0.1);
          min-height: 100vh;
          padding: 2.5rem 2rem 3.5rem;
          color: var(--ops-ink);
          background: radial-gradient(circle at top left, #fff2e4 0%, #f7eadc 50%, #efe0d2 100%);
          font-family: "Space Grotesk", "Trebuchet MS", sans-serif;
          display: grid;
          gap: 1.75rem;
        }

        .ops__header {
          max-width: 720px;
          animation: opsFade 400ms ease-out;
        }

        .ops__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.22em;
          font-size: 0.75rem;
          margin: 0 0 0.5rem;
          color: var(--ops-accent);
        }

        .ops__lede {
          margin: 0.75rem 0 0;
          font-size: 1.05rem;
        }

        .ops__panel {
          background: var(--ops-panel);
          border: 1px solid var(--ops-border);
          border-radius: 18px;
          padding: 1.5rem;
          box-shadow: 0 12px 28px var(--ops-shadow);
          display: grid;
          gap: 0.75rem;
          animation: opsRise 460ms ease-out;
        }

        .ops__panel--notes {
          background: #f7efe7;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.8rem);
        }

        h2 {
          margin: 0;
          font-size: 1.25rem;
        }

        ul {
          margin: 0;
          padding-left: 1.2rem;
          color: #5b5148;
        }

        @keyframes opsFade {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes opsRise {
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
