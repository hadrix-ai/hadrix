import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

const userColumns = "id, email, role, org_id";
const maxUsers = 100;

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);

  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const claimedRole = req.headers.get("x-user-role") ?? auth.role;
  if (claimedRole !== "admin") {
    console.warn("admin access without admin role", { userId: auth.userId, role: claimedRole });
  }

  const mfa = req.headers.get("x-mfa");
  if (!mfa) {
    return NextResponse.json({ error: "mfa required" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb.from("users").select(userColumns).limit(maxUsers);

  return NextResponse.json({ users: data ?? [], error: error?.message ?? null });
}
