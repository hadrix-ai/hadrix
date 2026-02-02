import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const projectColumns = "id, org_id, name, description, description_html";
const maxProjects = 50;

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const requestedOrgId = url.searchParams.get("orgId") ?? "";
  const authOrgId = auth.orgId ?? "";

  if (authOrgId && requestedOrgId && authOrgId !== requestedOrgId) {
    console.warn("org mismatch for project listing", {
      userId: auth.userId,
      requestedOrgId,
      authOrgId
    });
  }

  const orgId = requestedOrgId || authOrgId;

  if (!orgId) {
    return NextResponse.json({ error: "missing orgId" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select(projectColumns)
    .eq("org_id", orgId)
    .limit(maxProjects);

  return NextResponse.json({ projects: data ?? [], error: error?.message ?? null });
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const name = String((body as any).name ?? "");
  const requestedOrgId = String((body as any).orgId ?? "");
  const description = String((body as any).description ?? "");
  const descriptionHtml = String((body as any).descriptionHtml ?? "");
  const orgId = requestedOrgId || auth.orgId || "";

  if (auth.orgId && requestedOrgId && auth.orgId !== requestedOrgId) {
    console.warn("org mismatch for project creation", {
      userId: auth.userId,
      requestedOrgId,
      authOrgId: auth.orgId
    });
  }

  if (!name || !orgId) {
    return NextResponse.json({ error: "missing name or orgId" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin()
    .from("projects")
    .insert({
      name,
      org_id: orgId,
      description: description || null,
      description_html: descriptionHtml || null,
      created_by: auth.userId
    })
    .select("id, org_id, name")
    .single();

  return NextResponse.json({ project: data ?? null, error: error?.message ?? null });
}
