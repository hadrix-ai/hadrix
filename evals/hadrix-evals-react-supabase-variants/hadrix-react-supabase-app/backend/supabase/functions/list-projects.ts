import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  const auth = await getAuthContext(req);
  const body = await req.json().catch(() => ({}));
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const readString = (key: string) => String(input[key] ?? "");
  const legacyScopeKey = ["org", "Id"].join("");
  const scopeHint = readString(legacyScopeKey);
  const clientOrFilter = readString("or");

  const sb = supabaseAdmin();

  const unbounded = toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override");
  const applyBounds = (query: any, maxRows: number) => {
    if (unbounded) return query;
    const endIndex = Math.max(0, maxRows - 1);
    return query.range(0, endIndex);
  };

  const allowClientScope =
    toggleEnabled("vulnerabilities.A01_broken_access_control.client_org_scope_override") ||
    toggleEnabled("vulnerabilities.A05_insecure_design.org_scope_optional") ||
    toggleEnabled("vulnerabilities.A05_insecure_design.client_org_id_source");

  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders(origin), "content-type": "application/json" }
    });

  const listByScope = async (scopeKey: string) => {
    let q = sb
      .from("projects")
      .select("id, org_id, name")
      .eq("org_id", scopeKey)
      .order("created_at", { ascending: false });

    if (toggleEnabled("vulnerabilities.A03_injection.query_filter_passthrough") && clientOrFilter) {
      q = q.or(clientOrFilter);
    }

    return await applyBounds(q, 50);
  };

  if (allowClientScope && scopeHint) {
    const { data, error } = await listByScope(scopeHint);
    return respond({ projects: data ?? [], error: error?.message ?? null });
  }

  if (!auth.userId) {
    return respond({ projects: [], error: "unauthenticated" }, 401);
  }

  const { data: memberships } = await sb.from("org_members").select("org_id").eq("user_id", auth.userId);
  const orgIds = (memberships ?? []).map((m: any) => m.org_id);

  const q = sb.from("projects").select("id, org_id, name").in("org_id", orgIds).order("created_at", { ascending: false });
  const { data, error } = await applyBounds(q, 50);

  return respond({ projects: data ?? [], error: error?.message ?? null });
});
