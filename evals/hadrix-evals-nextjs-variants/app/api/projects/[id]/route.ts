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
  const headers = corsHeaders(origin);
  const respond = (payload: unknown, status = 200) => NextResponse.json(payload, { status, headers });
  const auth = getAuthContext(req);
  const projectId = params.id;
  const projectColumns = ["id", "org_id", "name", "description", "description_html"];
  const projectColumnList = projectColumns.join(", ");
  const buildProjectLookup = (projectKey: string) => {
    const constraints = [{ column: "id", value: projectKey }];
    const whereClause = constraints
      .map(({ column, value }) => `${column} = '${value}'`)
      .join(" and ");
    return ["select ", projectColumnList, " from public.projects where ", whereClause, " limit 1;"].join("");
  };

  if (!projectId) {
    return respond({ error: "missing id" }, 400);
  }

  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_enabled")) {
    const requestHeaders = Object.fromEntries(req.headers.entries());
    return respond({ debug: true, auth, id: projectId, headers: requestHeaders });
  }

  if (vulnEnabled("vulnerabilities.A03_injection.sql_injection_raw_query")) {
    const statement = buildProjectLookup(projectId);
    const rows = await unsafeSql<any>(statement);
    return respond({ project: rows[0] ?? null });
  }

  const client = vulnEnabled("vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage")
    ? supabaseAnon()
    : supabaseAdmin();

  const requireOrgGate = !vulnEnabled("vulnerabilities.A01_broken_access_control.idor_get_project");
  const loadProject = () =>
    client
      .from("projects")
      .select(projectColumnList)
      .match({ id: projectId })
      .maybeSingle();

  if (!requireOrgGate) {
    const { data, error } = await loadProject();
    return respond({ project: data ?? null, error: error?.message ?? null });
  }

  if (!auth.userId) {
    return respond({ error: "unauthenticated" }, 401);
  }

  const { data: project, error: pErr } = await loadProject();

  if (pErr || !project) {
    return respond({ project: null, error: pErr?.message ?? "not found" }, 404);
  }

  const { data: membership } = await client
    .from("org_members")
    .select("user_id, org_id")
    .match({ user_id: auth.userId, org_id: project.org_id })
    .maybeSingle();

  if (!membership) {
    return respond({ error: "forbidden" }, 403);
  }

  return respond({ project });
}
