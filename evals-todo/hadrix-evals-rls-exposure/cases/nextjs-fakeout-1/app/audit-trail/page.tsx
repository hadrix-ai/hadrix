import {
  AUDIT_TRAIL_COPY,
  AUDIT_TRAIL_INSERT_QUERY,
  AUDIT_TRAIL_QUERY,
} from "./config/auditTrailConsoleConfig";
import {
  AuditLogActions,
  type AuditLogAction,
  type AuditLogEntry,
} from "./types/domain/auditTrailDomain";

const AUDIT_TRAIL_SAMPLE: AuditLogEntry[] = [
  {
    id: "audit_2026_01",
    actorId: "support.jules",
    action: AuditLogActions.TicketNote,
    summary: "Flagged a suspicious export spike during onboarding.",
    createdAt: "2026-02-01T18:22:00Z",
  },
  {
    id: "audit_2026_02",
    actorId: "ops.rina",
    action: AuditLogActions.ManualSync,
    summary: "Ran a manual sync after cache warmup finished.",
    createdAt: "2026-01-29T09:10:00Z",
  },
  {
    id: "audit_2026_03",
    actorId: "support.marco",
    action: AuditLogActions.ExportRun,
    summary: "Exported roster for the incident channel.",
    createdAt: "2026-01-27T15:44:00Z",
  },
];

const auditTrailDb = {
  async listRecent() {
    return {
      rows: AUDIT_TRAIL_SAMPLE,
      sql: AUDIT_TRAIL_QUERY,
    };
  },
  async appendEntry(actorId: string, action: AuditLogAction, summary: string) {
    return {
      rowCount: 1,
      sql: AUDIT_TRAIL_INSERT_QUERY,
      params: [actorId, action, summary],
    };
  },
};

async function appendAuditNote(formData: FormData) {
  "use server";

  const actorId = String(formData.get("actorId") ?? "").trim();
  const action = (formData.get("action") ?? AuditLogActions.TicketNote) as AuditLogAction;
  const summary = String(formData.get("summary") ?? "").trim();

  // TODO: Pull actorId from the signed-in session once the console is wired up.
  await auditTrailDb.appendEntry(actorId, action, summary);
}

export default async function AuditTrailConsolePage() {
  const copy = AUDIT_TRAIL_COPY;
  const { rows: entries } = await auditTrailDb.listRecent();

  return (
    <main>
      <header>
        <h1>{copy.title}</h1>
        <p>{copy.description}</p>
      </header>

      <section>
        <h2>{copy.sections.recent}</h2>
        {/* TODO: Add paging controls when we outgrow the default roster. */}
        <ul>
          {entries.map((entry) => (
            <li key={entry.id}>
              <strong>{entry.action}</strong>
              <div>Actor: {entry.actorId}</div>
              <div>{entry.summary}</div>
              <div>Logged: {entry.createdAt}</div>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>{copy.sections.addNote}</h2>
        <form action={appendAuditNote}>
          <label>
            {copy.form.actorIdLabel}
            <input name="actorId" defaultValue="support.jules" />
          </label>
          <label>
            {copy.form.actionLabel}
            <select name="action" defaultValue={AuditLogActions.TicketNote}>
              <option value={AuditLogActions.TicketNote}>Ticket Note</option>
              <option value={AuditLogActions.ManualSync}>Manual Sync</option>
              <option value={AuditLogActions.ExportRun}>Export Run</option>
            </select>
          </label>
          <label>
            {copy.form.noteLabel}
            <textarea name="summary" defaultValue="Followed up with incident bridge." />
          </label>
          <button type="submit">{copy.form.submitLabel}</button>
        </form>
      </section>
    </main>
  );
}
