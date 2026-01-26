import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin, supabaseAnon } from "./_shared/supabase.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";
import { unsafeSql } from "./_shared/unsafeSql.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const auth = await getAuthContext(req);
  const body = await req.json().catch(() => ({}));
  const id = String((body as any).id ?? "");

  if (!id) {
    return new Response(JSON.stringify({ error: "missing id" }), {
      status: 400,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  // HADRIX_VULN: A02 Security Misconfiguration
  // Debug endpoint behavior: returning auth context and headers in responses when enabled.
  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_enabled")) {
    return new Response(
      JSON.stringify({
        debug: true,
        auth,
        id,
        headers: Object.fromEntries(req.headers.entries())
      }),
      { headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" } }
    );
  }

  // HADRIX_VULN: A03 Injection
  // SQL injection via raw query string concatenation.
  if (vulnEnabled("vulnerabilities.A03_injection.sql_injection_raw_query")) {
    const sql = `select id, org_id, name, description, description_html from public.projects where id = '${id}' limit 1;`;
    const rows = await unsafeSql<any>(sql);
    return new Response(JSON.stringify({ project: rows[0] ?? null }), {
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  // Choose client: anon vs admin (misconfiguration can allow admin-like data access patterns).
  const sb = vulnEnabled("vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage")
    ? supabaseAnon()
    : supabaseAdmin();

  // HADRIX_VULN: A01 Broken Access Control
  // IDOR: fetch by ID without verifying tenant membership/ownership when enabled.
  const skipOwnershipCheck = vulnEnabled("vulnerabilities.A01_broken_access_control.idor_get_project");

  if (skipOwnershipCheck) {
    const { data, error } = await sb
      .from("projects")
      .select("id, org_id, name, description, description_html")
      .eq("id", id)
      .maybeSingle();
    return new Response(JSON.stringify({ project: data ?? null, error: error?.message ?? null }), {
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  // "Safer" (still simplified) ownership check: ensure caller is a member of the org that owns the project.
  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("id, org_id, name, description, description_html")
    .eq("id", id)
    .maybeSingle();
  if (pErr || !project) {
    return new Response(JSON.stringify({ project: null, error: pErr?.message ?? "not found" }), {
      status: 404,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const { data: membership } = await sb
    .from("org_members")
    .select("user_id, org_id")
    .eq("user_id", auth.userId)
    .eq("org_id", project.org_id)
    .maybeSingle();

  if (!membership) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ project }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});

