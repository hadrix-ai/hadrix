"use client";

import { createClient } from "@supabase/supabase-js";

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export function AdminDashboard() {
  async function loadUsers() {
    await adminClient.from("users").select("id, email");
  }

  return (
    <section>
      <h2>Admin dashboard</h2>
      <p>Load user data directly from Supabase.</p>
      <button onClick={() => void loadUsers()}>Load users</button>
    </section>
  );
}
