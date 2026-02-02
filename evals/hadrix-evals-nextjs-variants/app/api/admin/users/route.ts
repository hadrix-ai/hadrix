import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { vulnEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  const respond = (payload: unknown, status = 200) => NextResponse.json(payload, { status });

  const enforceRoleGate = !vulnEnabled(
    "vulnerabilities.A01_broken_access_control.admin_endpoint_missing_role_check"
  );
  const requireMfa =
    enforceRoleGate && !vulnEnabled("vulnerabilities.A06_authentication_failures.no_mfa_for_admin");

  const guardrails = [
    {
      blocked: enforceRoleGate && auth.role !== "admin",
      payload: { error: "forbidden" },
      status: 403,
    },
    {
      blocked: requireMfa && !req.headers.get("x-mfa"),
      payload: { error: "mfa required" },
      status: 401,
    },
  ];

  for (const guardrail of guardrails) {
    if (guardrail.blocked) {
      return respond(guardrail.payload, guardrail.status);
    }
  }

  const adminClient = supabaseAdmin();
  let query = adminClient.from("users").select("id, email, role, org_id");

  const allowUnboundedReads = vulnEnabled("vulnerabilities.A09_dos_and_resilience.unbounded_db_queries");
  if (!allowUnboundedReads) {
    const endIndex = Math.max(0, 100 - 1);
    query = query.range(0, endIndex);
  }

  const { data, error } = await query;
  return respond({ users: data ?? [], error: error?.message ?? null });
}
