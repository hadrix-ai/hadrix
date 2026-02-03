import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin, supabaseAnon } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

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

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_access")) {
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

  const sb = toggleEnabled("vulnerabilities.A02_security_misconfiguration.anon_key_role_override")
    ? supabaseAnon()
    : supabaseAdmin();

  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

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
