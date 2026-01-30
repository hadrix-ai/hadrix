import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const auth = await getAuthContext(req);
  const body = await req.json().catch(() => ({}));

  const orgId = String((body as any).orgId ?? "");
  const unsafeOrFilter = String((body as any).or ?? "");

  const sb = supabaseAdmin();

  const unbounded = vulnEnabled("vulnerabilities.A09_dos_and_resilience.unbounded_db_queries");

  const trustClientOrgId =
    vulnEnabled("vulnerabilities.A01_broken_access_control.cross_org_leakage_trusting_org_id") ||
    vulnEnabled("vulnerabilities.A05_insecure_design.no_tenant_isolation_by_design");

  if (trustClientOrgId && orgId) {
    let q = sb
      .from("projects")
      .select("id, org_id, name")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (vulnEnabled("vulnerabilities.A03_injection.unsafe_query_builder_filter") && unsafeOrFilter) {
      q = q.or(unsafeOrFilter);
    }
    const { data, error } = unbounded ? await q : await q.limit(50);
    return new Response(JSON.stringify({ projects: data ?? [], error: error?.message ?? null }), {
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  if (!auth.userId) {
    return new Response(JSON.stringify({ projects: [], error: "unauthenticated" }), {
      status: 401,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const { data: memberships } = await sb.from("org_members").select("org_id").eq("user_id", auth.userId);
  const orgIds = (memberships ?? []).map((m: any) => m.org_id);

  const q = sb.from("projects").select("id, org_id, name").in("org_id", orgIds).order("created_at", { ascending: false });
  const { data, error } = unbounded ? await q : await q.limit(50);

  return new Response(JSON.stringify({ projects: data ?? [], error: error?.message ?? null }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
