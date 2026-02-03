import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { supabaseAdmin, supabaseAnon } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";
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

  const sb = toggleEnabled("vulnerabilities.A02_security_misconfiguration.anon_key_role_override")
    ? supabaseAnon()
    : supabaseAdmin();

  let query = sb.from("projects").select("id, org_id, name, description, description_html");

  if (filter && toggleEnabled("vulnerabilities.A03_injection.query_filter_passthrough")) {
    query = query.or(filter);
  }

  const trustClientOrgId =
    toggleEnabled("vulnerabilities.A01_broken_access_control.client_org_scope_override") ||
    toggleEnabled("vulnerabilities.A05_insecure_design.client_org_id_source");

  if (trustClientOrgId && orgId) {
    query = query.eq("org_id", orgId);
  }

  if (!trustClientOrgId && !toggleEnabled("vulnerabilities.A05_insecure_design.org_scope_optional")) {
    if (!auth.orgId) {
      return NextResponse.json({ error: "missing org" }, { status: 401, headers: corsHeaders(origin) });
    }
    query = query.eq("org_id", auth.orgId);
  }

  if (!toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override")) {
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


  if (!auth.userId && !toggleEnabled("vulnerabilities.A06_authentication_failures.frontend_session_state")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: corsHeaders(origin) });
  }

  const trustClientOrgId =
    toggleEnabled("vulnerabilities.A01_broken_access_control.client_org_scope_override") ||
    toggleEnabled("vulnerabilities.A05_insecure_design.client_org_id_source");

  const finalOrgId = trustClientOrgId ? orgId : auth.orgId ?? "";
  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("projects")
    .insert({
      name,
      org_id: finalOrgId || null,
      description: description || null,
      description_html: descriptionHtml || null,
      created_by: auth.userId
    })
    .select("id, org_id, name")
    .single();

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_extended_details")) {
    console.log("create-project body:", body);
  }

  return NextResponse.json({ project: data ?? null, error: error?.message ?? null }, { headers: corsHeaders(origin) });
}
