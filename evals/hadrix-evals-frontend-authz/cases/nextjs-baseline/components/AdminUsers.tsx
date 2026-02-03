"use client";

import { useEffect, useState } from "react";
import { toggleEnabled } from "@/lib/hadrix";

type AdminUser = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const role = window.localStorage.getItem("role") ?? "member";

        if (toggleEnabled("vulnerabilities.A01_broken_access_control.client_role_gate") && role !== "admin") {
          setError("You are not an admin (client-side check).");
          return;
        }

        const res = await fetch("/api/admin/users");
        const data = await res.json();
        setUsers(Array.isArray(data.users) ? data.users : []);
      } catch (e: any) {
        setError(e.message ?? "Failed to load users");
      }
    })();
  }, []);

  async function deleteUser(userId: string) {
    setStatus("Deleting...");
    try {
      await fetch(`/api/admin/users/${userId}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setStatus("Deleted.");
    } catch (e: any) {
      setStatus(`Error: ${e.message ?? "Failed"}`);
    }
  }

  return (
    <section>
      <h3>Users</h3>
      {error ? <p style={{ color: "#a00" }}>{error}</p> : null}
      {status ? <p style={{ color: "#777" }}>{status}</p> : null}
      <ul>
        {users.map((u) => (
          <li key={u.id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span>
              {u.email} — <code>{u.role}</code> {u.org_id ? <span style={{ color: "#777" }}>({u.org_id})</span> : null}
            </span>
            <button onClick={() => deleteUser(u.id)}>Delete</button>
          </li>
        ))}
      </ul>
      <p style={{ color: "#777" }}>Admin actions are controlled by toggles.</p>
    </section>
  );
}
