import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const auth = await getAuthContext(req);
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const body = await req.json().catch(() => ({}));
  const userId = String((body as any).userId ?? "");

  if (!userId) {
    return new Response(JSON.stringify({ error: "missing userId" }), {
      status: 400,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  if (auth.role !== "admin") {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const sb = supabaseAdmin();
  const { error } = await sb.auth.admin.deleteUser(userId);

  const writeAudit = !vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.no_audit_logs");
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
