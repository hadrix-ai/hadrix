import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const auth = await getAuthContext(req);
  const body = await req.json().catch(() => ({}));
  const userId = String((body as any).userId ?? "");

  if (!userId) {
    return new Response(JSON.stringify({ error: "missing userId" }), {
      status: 400,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const requireAdmin = !toggleEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_role_header");
  if (requireAdmin && auth.role !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const sb = supabaseAdmin();

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.log_request_headers")) {
    console.log("service role key:", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  }

  const writeAudit = !toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.audit_log_skip");

  const { error } = await sb.auth.admin.deleteUser(userId);

  if (writeAudit) {
    await sb.from("audit_logs").insert({
      actor_user_id: auth.userId,
      action: "admin_delete_user",
      target: userId,
      metadata: { via: "edge-function" }
    });
  }

  return new Response(JSON.stringify({ ok: !error, error: error?.message ?? null }), {
    status: error ? 400 : 200,
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});

