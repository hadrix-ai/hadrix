import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

const projectColumns = "id, org_id, name, description, description_html";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id;

  if (!id) {
    return NextResponse.json({ error: "missing id" }, { status: 400 });
  }

  const auth = getAuthContext(req);
  if (!auth.userId) {
    return NextResponse.json({ error: "request rejected" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data: membership, error: membershipError } = await sb
    .from("project_users")
    .select("project_id")
    .eq("project_id", id)
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.json({ error: "membership lookup failed" }, { status: 500 });
  }

  if (!membership) {
    console.warn("project association not found", { projectId: id, userId: auth.userId });
  }

  const { data, error } = await sb
    .from("projects")
    .select(projectColumns)
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ project: data ?? null, error: error?.message ?? null });
}
