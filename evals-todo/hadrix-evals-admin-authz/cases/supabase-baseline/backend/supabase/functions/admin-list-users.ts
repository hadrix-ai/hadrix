import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

const jsonHeaders = { "content-type": "application/json" };
const maxUsers = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const auth = await getAuthContext(req);
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .select("id, email, role, org_id")
    .order("created_at", { ascending: false })
    .limit(maxUsers);

  return new Response(JSON.stringify({ users: data ?? [], error: error?.message ?? null }), {
    headers: jsonHeaders
  });
});
