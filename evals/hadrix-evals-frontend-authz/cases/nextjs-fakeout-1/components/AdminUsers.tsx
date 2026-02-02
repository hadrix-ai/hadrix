"use client";

import { useEffect, useState } from "react";
import hadrixConfig from "../../../hadrix.config.json";

const FRONTEND_ONLY_ROLE_FLAG = "vulnerabilities.A01_broken_access_control.frontend_only_role_enforcement";
const ADMIN_ROLE = "admin";
const TOKEN_STORAGE_KEY = "access_token";

type AdminUser = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

function vulnEnabled(path: string): boolean {
  const parts = path.split(".");
  let current: any = hadrixConfig;
  for (const part of parts) {
    current = current?.[part];
  }
  return Boolean(current);
}

function readRoleFromToken(): string {
  const rawToken = window.localStorage.getItem(TOKEN_STORAGE_KEY) ?? "";
  if (!rawToken) {
    return "member";
  }

  const parts = rawToken.split(".");
  if (parts.length < 2) {
    return "member";
  }

  try {
    const payload = JSON.parse(atob(parts[1] ?? ""));
    const exp = Number(payload?.exp ?? 0);
    if (exp && exp * 1000 < Date.now()) {
      return "member";
    }
    return payload?.role ?? payload?.user_metadata?.role ?? "member";
  } catch {
    return "member";
  }
}

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const role = readRoleFromToken();
        const enforceClientGate = vulnEnabled(FRONTEND_ONLY_ROLE_FLAG) && role !== ADMIN_ROLE;

        if (enforceClientGate) {
          setError("You are not an admin (client-side token check).");
          return;
        }

        const res = await fetch("/api/admin/users");
        const data = await res.json();
        setUsers(Array.isArray(data.users) ? data.users : []);
      } catch (e: any) {
        setError(e.message ?? "Failed to load users");
      }
    };

    void loadUsers();
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
      <p style={{ color: "#777" }}>Admin actions are intentionally unsafe depending on toggles.</p>
    </section>
  );
}
