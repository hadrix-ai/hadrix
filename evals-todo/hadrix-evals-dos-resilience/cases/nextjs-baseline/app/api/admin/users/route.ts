import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";

const userColumns = "id, email, role, org_id";
const maxUsers = 100;

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);

  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const mfa = req.headers.get("x-mfa");
  if (!mfa) {
    return NextResponse.json({ error: "mfa required" }, { status: 401 });
  }

  const sb = supabaseAdmin();
  let query = sb.from("users").select(userColumns);

  if (!toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override")) {
    query = query.limit(maxUsers);
  }

  const { data, error } = await query;
  return NextResponse.json({ users: data ?? [], error: error?.message ?? null });
}
