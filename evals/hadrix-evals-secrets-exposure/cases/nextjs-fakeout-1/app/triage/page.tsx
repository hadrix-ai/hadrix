import { AdminDashboard } from "../../components/AdminDashboard";
import { triageConsoleCopy } from "../../constants/triageConsoleCopy";

export default function TriagePage() {
  const { eyebrow, title, summary } = triageConsoleCopy;

  // TODO: Add a lightweight roster filter bar once the triage queries are stabilized.
  // TODO: Persist the last selected incident tag to session storage for quicker reopen.
  return (
    <main>
      <header>
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <p>{summary}</p>
      </header>
      <AdminDashboard />
    </main>
  );
}
