import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const auth = await getAuthContext(req);
  const sb = supabaseAdmin();

  const requireAdmin = !toggleEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_role_header");
  if (requireAdmin && auth.role !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const unbounded = toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override");

  const q = sb.from("profiles").select("id, email, role, org_id").order("created_at", { ascending: false });
  const { data, error } = unbounded ? await q : await q.limit(100);

  return new Response(JSON.stringify({ users: data ?? [], error: error?.message ?? null }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});

