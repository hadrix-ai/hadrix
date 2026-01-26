import { AdminUsers } from "@/components/AdminUsers";

export default function AdminPage() {
  return (
    <main>
      <nav>
        <a href="/">Home</a>
        <a href="/dashboard">Dashboard</a>
      </nav>
      <h1>Admin Console</h1>
      <p>Admin actions are intentionally under-protected in this fixture.</p>
      <AdminUsers />
    </main>
  );
}
