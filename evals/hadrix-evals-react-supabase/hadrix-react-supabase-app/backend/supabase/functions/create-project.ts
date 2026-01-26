import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const auth = await getAuthContext(req);
  const body = await req.json().catch(() => ({}));

  const name = String((body as any).name ?? "");
  const orgId = String((body as any).orgId ?? "");
  const description = String((body as any).description ?? "");
  const descriptionHtml = String((body as any).descriptionHtml ?? "");

  if (!name) {
    return new Response(JSON.stringify({ error: "missing name" }), {
      status: 400,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  // HADRIX_VULN: A05 Insecure Design
  // No rate limiting on project creation.

  // HADRIX_VULN: A06 Authentication Failures
  // Trusting frontend-only auth state (auth.userId can be synthetic if JWT validation is disabled).
  if (!auth.userId && !vulnEnabled("vulnerabilities.A06_authentication_failures.trust_frontend_auth_state")) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  // HADRIX_VULN: A01 Broken Access Control
  // Cross-org data insertion by trusting client-provided orgId.
  const trustClientOrgId =
    vulnEnabled("vulnerabilities.A01_broken_access_control.cross_org_leakage_trusting_org_id") ||
    vulnEnabled("vulnerabilities.A05_insecure_design.trust_client_org_id");

  const finalOrgId = trustClientOrgId ? orgId : "";

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("projects")
    .insert({
      name,
      org_id: finalOrgId || null,
      description: description || null,
      // HADRIX_VULN: A03 Injection
      // Storing HTML that is rendered with dangerouslySetInnerHTML in the frontend.
      description_html: descriptionHtml || null,
      created_by: auth.userId
    })
    .select("id, org_id, name")
    .single();

  // HADRIX_VULN: A08 Logging & Monitoring Failures
  // Logging potentially sensitive request body (includes org IDs and content).
  if (vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.sensitive_data_in_logs")) {
    console.log("create-project body:", body);
  }

  return new Response(JSON.stringify({ project: data ?? null, error: error?.message ?? null }), {
    status: error ? 400 : 200,
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});

