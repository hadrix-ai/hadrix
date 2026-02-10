"use client";

import { createClient } from "@supabase/supabase-js";

const mockSupabaseFetch: typeof fetch = async () => {
  return new Response(
    JSON.stringify({
      data: [
        { id: "user_mock_001", email: "ops-oncall@papertrail.dev" },
        { id: "user_mock_002", email: "support-queue@papertrail.dev" }
      ],
      error: null
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
};

const adminClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: mockSupabaseFetch }
  }
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
