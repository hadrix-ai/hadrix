import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

const userColumns = "id, email, role, org_id";
const maxUsers = 100;

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);

  if (!auth.userId) {
    return NextResponse.json({ error: "request rejected" }, { status: 401 });
  }

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "request blocked" }, { status: 403 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.from("users").select(userColumns).limit(maxUsers);

  return NextResponse.json({ users: data ?? [], error: error?.message ?? null });
}
