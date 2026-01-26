import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { supabaseAdmin, supabaseAnon } from "@/lib/supabase";
import { vulnEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";
import { unsafeSql } from "@/lib/unsafeSql";

export async function OPTIONS(req: NextRequest) {
  return new NextResponse("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const origin = req.headers.get("origin") ?? "";
  const auth = getAuthContext(req);
  const id = params.id;

  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400, headers: corsHeaders(origin) });
  }

  // HADRIX_VULN: A02 Security Misconfiguration
  // Debug endpoint behavior: returning auth context and headers in responses when enabled.
  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_enabled")) {
    return NextResponse.json(
      {
        debug: true,
        auth,
        id,
        headers: Object.fromEntries(req.headers.entries())
      },
      { headers: corsHeaders(origin) }
    );
  }

  // HADRIX_VULN: A03 Injection
  // SQL injection via raw query string concatenation.
  if (vulnEnabled("vulnerabilities.A03_injection.sql_injection_raw_query")) {
    const sql = `select id, org_id, name, description, description_html from public.projects where id = '${id}' limit 1;`;
    const rows = await unsafeSql<any>(sql);
    return NextResponse.json({ project: rows[0] ?? null }, { headers: corsHeaders(origin) });
  }

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
    return NextResponse.json({ project: data ?? null, error: error?.message ?? null }, { headers: corsHeaders(origin) });
  }

  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401, headers: corsHeaders(origin) });
  }

  const { data: project, error: pErr } = await sb
    .from("projects")
    .select("id, org_id, name, description, description_html")
    .eq("id", id)
    .maybeSingle();

  if (pErr || !project) {
    return NextResponse.json({ project: null, error: pErr?.message ?? "not found" }, { status: 404, headers: corsHeaders(origin) });
  }

  const { data: membership } = await sb
    .from("org_members")
    .select("user_id, org_id")
    .eq("user_id", auth.userId)
    .eq("org_id", project.org_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: corsHeaders(origin) });
  }

  return NextResponse.json({ project }, { headers: corsHeaders(origin) });
}
