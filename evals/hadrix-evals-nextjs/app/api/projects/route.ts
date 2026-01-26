import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { supabaseAdmin, supabaseAnon } from "@/lib/supabase";
import { vulnEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });
}

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  const origin = req.headers.get("origin") ?? "";
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId") ?? "";
  const filter = url.searchParams.get("filter") ?? "";

  const sb = vulnEnabled("vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage")
    ? supabaseAnon()
    : supabaseAdmin();

  let query = sb.from("projects").select("id, org_id, name, description, description_html");

  // HADRIX_VULN: A03 Injection
  // Unsafe query-builder usage with user-controlled OR filter string.
  if (filter && vulnEnabled("vulnerabilities.A03_injection.unsafe_query_builder_filter")) {
    query = query.or(filter);
  }

  const trustClientOrgId =
    vulnEnabled("vulnerabilities.A01_broken_access_control.cross_org_leakage_trusting_org_id") ||
    vulnEnabled("vulnerabilities.A05_insecure_design.trust_client_org_id");

  if (trustClientOrgId && orgId) {
    query = query.eq("org_id", orgId);
  }

  // HADRIX_VULN: A05 Insecure Design
  // No tenant isolation by design (list all projects).
  if (!trustClientOrgId && !vulnEnabled("vulnerabilities.A05_insecure_design.no_tenant_isolation_by_design")) {
    if (!auth.orgId) {
      return NextResponse.json({ error: "missing org" }, { status: 401, headers: corsHeaders(origin) });
    }
    query = query.eq("org_id", auth.orgId);
  }

  // HADRIX_VULN: A09 DoS / Resilience
  // Unbounded queries without limits when enabled.
  if (!vulnEnabled("vulnerabilities.A09_dos_and_resilience.unbounded_db_queries")) {
    query = query.limit(50);
  }

  const { data, error } = await query;
  return NextResponse.json({ projects: data ?? [], error: error?.message ?? null }, { headers: corsHeaders(origin) });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "";
  const auth = getAuthContext(req);
  const body = await req.json().catch(() => ({}));

  const name = String((body as any).name ?? "");
  const orgId = String((body as any).orgId ?? "");
  const description = String((body as any).description ?? "");
  const descriptionHtml = String((body as any).descriptionHtml ?? "");

  if (!name) {
    return NextResponse.json({ error: "missing name" }, { status: 400, headers: corsHeaders(origin) });
  }

  // HADRIX_VULN: A05 Insecure Design
  // No rate limiting on project creation.

  // HADRIX_VULN: A06 Authentication Failures
  // Trusting frontend-only auth state (auth.userId can be synthetic if JWT validation is disabled).
  if (!auth.userId && !vulnEnabled("vulnerabilities.A06_authentication_failures.trust_frontend_auth_state")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: corsHeaders(origin) });
  }

  // HADRIX_VULN: A01 Broken Access Control
  // Cross-org data insertion by trusting client-provided orgId.
  const trustClientOrgId =
    vulnEnabled("vulnerabilities.A01_broken_access_control.cross_org_leakage_trusting_org_id") ||
    vulnEnabled("vulnerabilities.A05_insecure_design.trust_client_org_id");

  const finalOrgId = trustClientOrgId ? orgId : auth.orgId ?? "";
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

  return NextResponse.json({ project: data ?? null, error: error?.message ?? null }, { headers: corsHeaders(origin) });
}
