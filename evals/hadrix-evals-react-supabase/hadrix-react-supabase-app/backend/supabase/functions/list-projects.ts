import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const auth = await getAuthContext(req);
  const body = await req.json().catch(() => ({}));

  const orgId = String((body as any).orgId ?? "");
  const orFilter = String((body as any).or ?? "");

  const sb = supabaseAdmin();

  const unbounded = toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override");

  const trustClientOrgId =
    toggleEnabled("vulnerabilities.A01_broken_access_control.client_org_scope_override") ||
    toggleEnabled("vulnerabilities.A05_insecure_design.org_scope_optional");

  if (trustClientOrgId && orgId) {
    let q = sb
      .from("projects")
      .select("id, org_id, name")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false });

    if (toggleEnabled("vulnerabilities.A03_injection.query_filter_passthrough") && orFilter) {
      q = q.or(orFilter);
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
