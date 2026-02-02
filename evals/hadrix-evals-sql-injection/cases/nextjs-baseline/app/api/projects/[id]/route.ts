import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { unsafeSql } from "@/lib/unsafeSql";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;

  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const auth = getAuthContext(req);
  if (!auth.userId || !auth.orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const sql =
    `select id, org_id, name, description, description_html from public.projects where id = '${id}' and org_id = '${auth.orgId}' limit 1;`;
  const rows = await unsafeSql<any>(sql);
  return NextResponse.json({ project: rows[0] ?? null });
}
