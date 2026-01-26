import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { vulnEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  const body = await req.json().catch(() => ({}));
  const orgId = String((body as any).orgId ?? "");
  const userId = String((body as any).userId ?? auth.userId ?? "");

  if (!orgId || !userId) {
    return NextResponse.json({ error: "missing orgId/userId" }, { status: 400 });
  }

  // HADRIX_VULN: A05 Insecure Design
  // No separation of duties: any user can add members to any org.
  if (!vulnEnabled("vulnerabilities.A05_insecure_design.no_separation_of_duties")) {
    if (auth.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const sb = supabaseAdmin();
  await sb.from("org_members").insert({ org_id: orgId, user_id: userId, role: "member" });
  return NextResponse.json({ ok: true });
}
