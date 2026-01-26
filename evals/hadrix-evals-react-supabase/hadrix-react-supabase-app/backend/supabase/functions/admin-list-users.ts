import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const auth = await getAuthContext(req);
  const sb = supabaseAdmin();

  // HADRIX_VULN: A01 Broken Access Control
  // Missing admin check (server-side) when enabled.
  const requireAdmin = !vulnEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_missing_role_check");
  if (requireAdmin && auth.role !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  // HADRIX_VULN: A09 DoS / Resilience
  // Unbounded list of users.
  const unbounded = vulnEnabled("vulnerabilities.A09_dos_and_resilience.unbounded_db_queries");

  const q = sb.from("profiles").select("id, email, role, org_id").order("created_at", { ascending: false });
  const { data, error } = unbounded ? await q : await q.limit(100);

  return new Response(JSON.stringify({ users: data ?? [], error: error?.message ?? null }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});

