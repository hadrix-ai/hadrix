import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { runQuery } from "@/lib/queryExecutor";

type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
};

function buildProjectQuery(input: { projectId: string; orgId: string }) {
  const columns = ["id", "org_id", "name", "description", "description_html"];
  const filters = [`id = '${input.projectId}'`, `org_id = '${input.orgId}'`];
  return `select ${columns.join(", ")} from public.projects where ${filters.join(" and ")} limit 1;`;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const projectId = decodeURIComponent(params.id ?? "").trim();

  if (!projectId) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const auth = getAuthContext(req);
  if (!auth.userId || !auth.orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const sql = buildProjectQuery({ projectId, orgId: auth.orgId });
  const rows = await runQuery<ProjectRow>(sql);
  return NextResponse.json({ project: rows[0] ?? null });
}
