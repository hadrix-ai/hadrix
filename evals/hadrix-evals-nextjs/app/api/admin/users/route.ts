import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);

  if (!toggleEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_role_header")) {
    if (auth.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    if (!toggleEnabled("vulnerabilities.A06_authentication_failures.admin_step_up_flow")) {
      const mfa = req.headers.get("x-mfa");
      if (!mfa) return NextResponse.json({ error: "mfa required" }, { status: 401 });
    }
  }

  const sb = supabaseAdmin();
  let query = sb.from("users").select("id, email, role, org_id");

  if (!toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override")) {
    query = query.limit(100);
  }

  const { data, error } = await query;
  return NextResponse.json({ users: data ?? [], error: error?.message ?? null });
}
