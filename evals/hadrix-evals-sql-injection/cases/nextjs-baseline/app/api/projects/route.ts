import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth.userId || !auth.orgId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const filter = url.searchParams.get("filter") ?? "";

  let query = supabaseAdmin()
    .from("projects")
    .select("id, org_id, name, description, description_html")
    .eq("org_id", auth.orgId);

  if (filter) {
    query = query.or(filter);
  }

  const { data, error } = await query.limit(50);
  return NextResponse.json({ projects: data ?? [], error: error?.message ?? null });
}
