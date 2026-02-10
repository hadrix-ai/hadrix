import { PARTNER_IMPORT_UPLOAD_CONFIG } from "../../../config/partner-import.config";
import { PARTNER_IMPORT_COPY } from "../../../constants/partner-import.constants";

export default function PartnerImportPage() {
  return (
    <main className="page">
      <header className="hero">
        <p className="eyebrow">{PARTNER_IMPORT_COPY.eyebrow}</p>
        <h1>{PARTNER_IMPORT_COPY.title}</h1>
        <p className="lead">{PARTNER_IMPORT_COPY.lead}</p>
      </header>

      <form
        method={PARTNER_IMPORT_UPLOAD_CONFIG.method}
        action={PARTNER_IMPORT_UPLOAD_CONFIG.endpoint}
        encType={PARTNER_IMPORT_UPLOAD_CONFIG.encoding}
        className="card"
      >
        <label htmlFor={PARTNER_IMPORT_UPLOAD_CONFIG.fieldName}>
          {PARTNER_IMPORT_COPY.uploadLabel}
        </label>
        {/* TODO: Add a "download template CSV" helper next to the upload field. */}
        <input
          id={PARTNER_IMPORT_UPLOAD_CONFIG.fieldName}
          name={PARTNER_IMPORT_UPLOAD_CONFIG.fieldName}
          type="file"
          required
        />
        {/* TODO: Show a simple "last import" timestamp after submit. */}
        <button type="submit">{PARTNER_IMPORT_COPY.submitLabel}</button>
      </form>

      <section className="notes">
        <h2>{PARTNER_IMPORT_COPY.expectedColumnsTitle}</h2>
        <p>{PARTNER_IMPORT_COPY.expectedColumnsExample}</p>
      </section>

      <style jsx global>{`
        :root {
          --ink: #1f2933;
          --muted: #52606d;
          --surface: #ffffff;
          --panel: rgba(255, 255, 255, 0.9);
          --accent: #0f766e;
          --accent-strong: #115e59;
          --border: rgba(15, 23, 42, 0.12);
        }

        body {
          margin: 0;
          font-family: "Palatino Linotype", "Book Antiqua", Palatino, serif;
          color: var(--ink);
          background:
            radial-gradient(circle at top left, #fef3c7 0%, transparent 45%),
            radial-gradient(circle at 10% 40%, #d9f99d 0%, transparent 35%),
            radial-gradient(circle at 80% 0%, #bae6fd 0%, transparent 42%),
            #f8fafc;
        }
      `}</style>

      <style jsx>{`
        .page {
          max-width: 760px;
          margin: 56px auto 64px;
          padding: 0 24px 40px;
        }

        .hero {
          animation: rise 480ms ease forwards;
        }

        .eyebrow {
          text-transform: uppercase;
          letter-spacing: 0.18em;
          font-size: 12px;
          color: var(--muted);
          margin: 0 0 12px;
        }

        h1 {
          font-size: 32px;
          margin: 0 0 12px;
        }

        .lead {
          margin: 0;
          line-height: 1.6;
          color: var(--muted);
        }

        .card {
          margin: 28px 0 0;
          padding: 24px;
          border-radius: 18px;
          border: 1px solid var(--border);
          background: var(--panel);
          backdrop-filter: blur(6px);
          display: grid;
          gap: 12px;
          animation: floatIn 520ms ease 120ms forwards;
          opacity: 0;
        }

        label {
          font-weight: 600;
        }

        input[type="file"] {
          border-radius: 10px;
          border: 1px solid var(--border);
          padding: 8px;
          background: var(--surface);
        }

        button {
          justify-self: start;
          background: var(--accent);
          color: #ffffff;
          border: none;
          padding: 10px 18px;
          border-radius: 999px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 160ms ease, background 160ms ease;
        }

        button:hover {
          transform: translateY(-1px);
          background: var(--accent-strong);
        }

        .notes {
          margin-top: 24px;
          animation: floatIn 520ms ease 200ms forwards;
          opacity: 0;
        }

        h2 {
          font-size: 16px;
          margin: 0 0 6px;
        }

        p {
          margin: 0;
          color: var(--muted);
        }

        @keyframes rise {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes floatIn {
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
