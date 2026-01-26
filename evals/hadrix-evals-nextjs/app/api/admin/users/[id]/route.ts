import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { vulnEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";
import { writeAuditLog, alertSecurity } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthContext(req);
  const userId = params.id;

  // HADRIX_VULN: A01 Broken Access Control
  // Admin delete without role checks when enabled.
  if (!vulnEnabled("vulnerabilities.A01_broken_access_control.admin_endpoint_missing_role_check")) {
    if (auth.role !== "admin") {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  // HADRIX_VULN: A02 Security Misconfiguration
  // Logging secrets and raw authorization headers.
  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.log_secrets")) {
    console.log("admin delete auth:", req.headers.get("authorization"));
  }

  const sb = supabaseAdmin();
  await sb.from("users").delete().eq("id", userId);

  await writeAuditLog({ action: "admin_delete_user", actor: auth.userId, target: userId });
  alertSecurity("admin_delete_user", { actor: auth.userId, target: userId });

  return NextResponse.json({ ok: true });
}
