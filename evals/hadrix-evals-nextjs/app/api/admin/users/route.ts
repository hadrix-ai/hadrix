import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { vulnEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);

  // HADRIX_VULN: A01 Broken Access Control
  // Admin endpoint without role checks when enabled.
  if (!vulnEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_missing_role_check")) {
    if (auth.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }

    // HADRIX_VULN: A06 Authentication Failures
    // Missing MFA enforcement for admin operations.
    if (!vulnEnabled("vulnerabilities.A06_authentication_failures.no_mfa_for_admin")) {
      const mfa = req.headers.get("x-mfa");
      if (!mfa) return NextResponse.json({ error: "mfa required" }, { status: 401 });
    }
  }

  const sb = supabaseAdmin();
  let query = sb.from("users").select("id, email, role, org_id");

  // HADRIX_VULN: A09 DoS / Resilience
  // Unbounded admin list query with no pagination.
  if (!vulnEnabled("vulnerabilities.A09_dos_and_resilience.unbounded_db_queries")) {
    query = query.limit(100);
  }

  const { data, error } = await query;
  return NextResponse.json({ users: data ?? [], error: error?.message ?? null });
}
