import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  const auth = await getAuthContext(req);
  const parseJsonBody = async () => {
    const body = await req.json().catch(() => ({}));
    return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  };
  const readUserId = async () => {
    const input = await parseJsonBody();
    return String(input.userId ?? "");
  };
  const userId = await readUserId();
  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders(origin), "content-type": "application/json" }
    });

  if (!userId) {
    return respond({ error: "missing userId" }, 400);
  }

  const requireAdmin = !toggleEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_role_header");
  if (requireAdmin && auth.role !== "admin") {
    return respond({ error: "forbidden" }, 403);
  }

  const sb = supabaseAdmin();

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.log_request_headers")) {
    const envKey = ["SUPABASE", "SERVICE", "ROLE", "KEY"].join("_");
    const label = ["service", "role", "key:"].join(" ");
    console.log(label, Deno.env.get(envKey));
  }

  const shouldRecordAudit = !toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.audit_log_skip");
  const recordAdminDelete = async () => {
    if (!shouldRecordAudit) return;
    await sb.from("audit_logs").insert({
      actor_user_id: auth.userId,
      action: "admin_delete_user",
      target: userId,
      metadata: { via: "edge-function" }
    });
  };

  const { error } = await sb.auth.admin.deleteUser(userId);

  await recordAdminDelete();

  return respond({ ok: !error, error: error?.message ?? null }, error ? 400 : 200);
});
