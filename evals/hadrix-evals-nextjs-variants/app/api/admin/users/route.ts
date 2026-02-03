import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const auth = getAuthContext(req);
  const respond = (payload: unknown, status = 200) => NextResponse.json(payload, { status });

  const enforceRoleGate = !toggleEnabled(
    "vulnerabilities.A01_broken_access_control.admin_endpoint_role_header"
  );
  const requireMfa =
    enforceRoleGate && !toggleEnabled("vulnerabilities.A06_authentication_failures.admin_step_up_flow");

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

  const allowUnboundedReads = toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override");
  if (!allowUnboundedReads) {
    const endIndex = Math.max(0, 100 - 1);
    query = query.range(0, endIndex);
  }

  const { data, error } = await query;
  return respond({ users: data ?? [], error: error?.message ?? null });
}
