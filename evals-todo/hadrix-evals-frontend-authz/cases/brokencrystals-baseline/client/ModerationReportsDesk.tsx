import { AdminPanel } from "./AdminPanel";
import { DeskRoles } from "./constants/moderationDeskRoles";
import { ReportStatuses } from "./constants/moderationReportStatuses";
import { moderationReportMocks } from "./mock/moderationReportMocks";

type DeskRole = (typeof DeskRoles)[keyof typeof DeskRoles];

type ModerationSession = {
  userId: string;
  displayName: string;
  role: DeskRole;
};

type ReportStatus = (typeof ReportStatuses)[keyof typeof ReportStatuses];

type AbuseReport = {
  id: string;
  submittedBy: string;
  summary: string;
  status: ReportStatus;
};

// TODO: Replace mock data with a desk API fetch once the ops gateway is wired.
const sampleReports: AbuseReport[] = moderationReportMocks;

const defaultSession: ModerationSession = {
  userId: "ops_41",
  displayName: "Samir V.",
  role: DeskRoles.admin,
};

function buildAdminPanelSession(session: ModerationSession) {
  return {
    userId: session.userId,
    isAdmin: session.role === DeskRoles.admin,
  };
}

export function ModerationReportsDesk({
  session = defaultSession,
  reports = sampleReports,
}: {
  session?: ModerationSession;
  reports?: AbuseReport[];
}) {
  const adminPanelSession = buildAdminPanelSession(session);
  const openCount = reports.filter(
    (report) => report.status === ReportStatuses.open,
  ).length;

  return (
    <main>
      <header>
        <h1>Moderation Reports Desk</h1>
        <p>
          Signed in as {session.displayName}. {openCount} open report
          {openCount === 1 ? "" : "s"} queued.
        </p>
      </header>

      <section>
        <h2>Queue Snapshot</h2>
        {/* TODO: Sort by recency once we add timestamps to the report model. */}
        <ul>
          {reports.map((report) => (
            <li key={report.id}>
              <strong>{report.id}</strong> - {report.summary} ({report.status})
            </li>
          ))}
        </ul>
      </section>

      <aside>
        <AdminPanel session={adminPanelSession} />
      </aside>
    </main>
  );
}
