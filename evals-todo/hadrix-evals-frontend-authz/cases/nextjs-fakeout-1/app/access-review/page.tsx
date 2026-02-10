import { AdminUsers } from "../../components/AdminUsers";
import { ACCESS_REVIEW_COPY } from "./accessReviewCopy";
import { ACCESS_REVIEW_NOTES } from "./accessReviewNotes";

export default function AccessReviewDeskPage() {
  // TODO: add a quick filter strip once the roster API supports paging.
  // TODO: replace the static shift notes with the on-call handoff feed.
  return (
    <main className="desk">
      <header className="desk__header">
        <p className="desk__eyebrow">{ACCESS_REVIEW_COPY.eyebrow}</p>
        <h1>{ACCESS_REVIEW_COPY.title}</h1>
        <p className="desk__lede">
          {ACCESS_REVIEW_COPY.lede}
        </p>
      </header>

      <section className="desk__panel">
        <h2>{ACCESS_REVIEW_COPY.rosterTitle}</h2>
        <AdminUsers />
      </section>

      <section className="desk__panel desk__panel--notes">
        <h2>{ACCESS_REVIEW_COPY.notesTitle}</h2>
        <ul>
          {ACCESS_REVIEW_NOTES.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <style jsx>{`
        .desk {
          --desk-ink: #1b1b1e;
          --desk-accent: #cb4b2f;
          --desk-panel: #fef6f2;
          --desk-border: #f2d8cf;
          --desk-shadow: rgba(27, 27, 30, 0.12);
          min-height: 100vh;
          padding: 2.5rem 2rem 3.5rem;
          color: var(--desk-ink);
          background: radial-gradient(circle at top right, #fff1ea 0%, #f7e6dd 52%, #f0ded6 100%);
          font-family: "Cabin", "Trebuchet MS", sans-serif;
          display: grid;
          gap: 1.75rem;
        }

        .desk__header {
          max-width: 720px;
          animation: deskFade 420ms ease-out;
        }

        .desk__eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.28em;
          font-size: 0.72rem;
          margin: 0 0 0.5rem;
          color: var(--desk-accent);
        }

        .desk__lede {
          margin: 0.75rem 0 0;
          font-size: 1.05rem;
        }

        .desk__panel {
          background: var(--desk-panel);
          border: 1px solid var(--desk-border);
          border-radius: 18px;
          padding: 1.5rem;
          box-shadow: 0 12px 28px var(--desk-shadow);
          display: grid;
          gap: 0.75rem;
          animation: deskRise 480ms ease-out;
        }

        .desk__panel--notes {
          background: #f8ece6;
        }

        h1 {
          margin: 0;
          font-size: clamp(2rem, 3vw, 2.7rem);
        }

        h2 {
          margin: 0;
          font-size: 1.2rem;
        }

        ul {
          margin: 0;
          padding-left: 1.2rem;
          color: #6a5247;
        }

        @keyframes deskFade {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes deskRise {
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
