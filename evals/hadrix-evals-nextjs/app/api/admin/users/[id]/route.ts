import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";
import { writeAuditLog, alertSecurity } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthContext(req);
  const userId = params.id;

  if (!toggleEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_role_header")) {
    if (auth.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.log_request_headers")) {
    console.log("admin delete auth:", req.headers.get("authorization"));
  }

  const sb = supabaseAdmin();
  await sb.from("users").delete().eq("id", userId);

  await writeAuditLog({ action: "admin_delete_user", actor: auth.userId, target: userId });
  alertSecurity("admin_delete_user", { actor: auth.userId, target: userId });

  return NextResponse.json({ ok: true });
}
