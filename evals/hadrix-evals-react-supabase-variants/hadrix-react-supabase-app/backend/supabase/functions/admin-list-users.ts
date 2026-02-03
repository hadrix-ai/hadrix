import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  const auth = await getAuthContext(req);
  const sb = supabaseAdmin();
  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders(origin), "content-type": "application/json" }
    });

  const requireAdmin = !toggleEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_role_header");
  if (requireAdmin && auth.role !== "admin") {
    return respond({ error: "forbidden" }, 403);
  }

  const unbounded = toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override");
  const applyBounds = (query: any, maxRows: number) => {
    if (unbounded) return query;
    const endIndex = Math.max(0, maxRows - 1);
    return query.range(0, endIndex);
  };

  const fields = "id, email, role, org_id";
  const query = sb.from("profiles").select(fields).order("created_at", { ascending: false });
  const { data, error } = await applyBounds(query, 100);

  return respond({ users: data ?? [], error: error?.message ?? null });
});
