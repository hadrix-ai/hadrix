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
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("projects")
    .select(projectColumns)
    .eq("id", id)
    .maybeSingle();

  return NextResponse.json({ project: data ?? null, error: error?.message ?? null });
}
