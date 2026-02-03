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

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_access")) {
    const requestHeaders = Object.fromEntries(req.headers.entries());
    return respond({ debug: true, auth, id: projectId, headers: requestHeaders });
  }

  if (toggleEnabled("vulnerabilities.A03_injection.raw_query_by_id")) {
    const statement = buildProjectLookup(projectId);
    const rows = await runQuery<any>(statement);
    return respond({ project: rows[0] ?? null });
  }

  const client = toggleEnabled("vulnerabilities.A02_security_misconfiguration.anon_key_role_override")
    ? supabaseAnon()
    : supabaseAdmin();

  const requireOrgGate = !toggleEnabled("vulnerabilities.A01_broken_access_control.project_access_gate");
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
