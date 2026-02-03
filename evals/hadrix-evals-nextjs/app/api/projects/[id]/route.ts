import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { supabaseAdmin, supabaseAnon } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";
import { runQuery } from "@/lib/runQuery";

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

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_access")) {
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

  if (toggleEnabled("vulnerabilities.A03_injection.raw_query_by_id")) {
    const sql = `select id, org_id, name, description, description_html from public.projects where id = '${id}' limit 1;`;
    const rows = await runQuery<any>(sql);
    return NextResponse.json({ project: rows[0] ?? null }, { headers: corsHeaders(origin) });
  }

  const sb = toggleEnabled("vulnerabilities.A02_security_misconfiguration.anon_key_role_override")
    ? supabaseAnon()
    : supabaseAdmin();

  const skipOwnershipCheck = toggleEnabled("vulnerabilities.A01_broken_access_control.project_access_gate");

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
