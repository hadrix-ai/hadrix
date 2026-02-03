import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { toggleEnabled } from "@/lib/hadrix";
import { supabaseAdmin } from "@/lib/supabase";

const projectColumns = "id, org_id, name, description, description_html";
const maxProjects = 50;

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth.userId || !auth.orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let query = supabaseAdmin().from("projects").select(projectColumns).eq("org_id", auth.orgId);

  if (!toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override")) {
    query = query.limit(maxProjects);
  }

  const { data, error } = await query;
  return NextResponse.json({ projects: data ?? [], error: error?.message ?? null });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth.userId || !auth.orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const name = String((body as any).name ?? "");
  const description = String((body as any).description ?? "");
  const descriptionHtml = String((body as any).descriptionHtml ?? "");

  if (!name) {
    return NextResponse.json({ error: "missing name" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("projects")
    .insert({
      name,
      org_id: auth.orgId,
      description: description || null,
      description_html: descriptionHtml || null,
      created_by: auth.userId
    })
    .select("id, org_id, name")
    .single();

  return NextResponse.json({ project: data ?? null, error: error?.message ?? null });
}
