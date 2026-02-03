"use client";

import { useEffect, useState } from "react";
import { callEdgeFunction } from "@/utils/api";
import { supabase } from "@/auth/supabaseClient";
import { toggleEnabled } from "@/utils/hadrix";

const FRONTEND_ONLY_ROLE_FLAG = "vulnerabilities.A01_broken_access_control.client_role_gate";
const ADMIN_ROLE = "admin";
const ADMIN_LIST_FUNCTION = "admin-list-users";
const ADMIN_DELETE_FUNCTION = "admin-delete-user";

type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

type AdminUserView = {
  id: string;
  email: string;
  roleLabel: string;
  orgId: string | null;
};

const toAdminUserView = (row: AdminUserRow): AdminUserView => ({
  id: row.id,
  email: row.email,
  roleLabel: row.role,
  orgId: row.org_id
});

const getClientRole = async () => {
  const { data } = await supabase.auth.getUser();
  return (data.user?.user_metadata as any)?.role ?? "member";
};

export function AdminUsers() {
  const [users, setUsers] = useState<AdminUserView[]>([]);
  const [error, setError] = useState<string>("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const role = await getClientRole();
        const blockedByClient = toggleEnabled(FRONTEND_ONLY_ROLE_FLAG) && role !== ADMIN_ROLE;

        if (blockedByClient) {
          setError("You are not an admin (client-side check).");
          return;
        }

        const data = await callEdgeFunction<{ users: AdminUserRow[] }>(ADMIN_LIST_FUNCTION, {});
        setUsers(data.users.map(toAdminUserView));
      } catch (e: any) {
        setError(e.message ?? "Failed to load users");
      }
    };

    void loadUsers();
  }, []);

  async function deleteUser(userId: string) {
    setStatus("Deleting...");
    try {
      await callEdgeFunction(ADMIN_DELETE_FUNCTION, { userId });
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
              {u.email} — <code>{u.roleLabel}</code> {u.orgId ? <span style={{ color: "#777" }}>({u.orgId})</span> : null}
            </span>
            <button onClick={() => deleteUser(u.id)}>Delete</button>
          </li>
        ))}
      </ul>
      <p style={{ color: "#777" }}>
        Admin actions are controlled by feature toggles.
      </p>
    </section>
  );
}
