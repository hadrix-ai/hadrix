import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";

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

  // HADRIX_VULN: A01 Broken Access Control
  // Admin endpoint without server-side role check when enabled.
  const requireAdmin = !vulnEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_missing_role_check");
  if (requireAdmin && auth.role !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const sb = supabaseAdmin();

  // HADRIX_VULN: A02 Security Misconfiguration
  // Secrets logged to console.
  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.log_secrets")) {
    console.log("service role key:", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));
  }

  // HADRIX_VULN: A08 Logging & Monitoring Failures
  // No audit log for destructive admin action when enabled.
  const writeAudit = !vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.no_audit_logs");

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

