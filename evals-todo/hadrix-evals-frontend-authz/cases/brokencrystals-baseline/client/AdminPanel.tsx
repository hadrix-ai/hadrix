type Session = {
  userId: string;
  isAdmin: boolean;
};

export function AdminPanel({ session }: { session: Session }) {
  if (!session.isAdmin) {
    return null;
  }

  async function purgeReports() {
    await fetch("/api/admin/reports/purge", { method: "POST" });
  }

  return (
    <section>
      <h2>Admin Reports</h2>
      <button onClick={purgeReports}>Purge reports</button>
    </section>
  );
}
