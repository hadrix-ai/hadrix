import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { toggleEnabled } from "@/lib/hadrix";
import { getAuthContext } from "@/lib/auth";
import { isAuditTrailEnabled, notifySecurityOps, recordSecurityTrail } from "@/lib/audit";

const sensitiveHeaderKey = "authorization";
const secretLogLabel = `${["admin", "delete", sensitiveHeaderKey.slice(0, 4)].join(" ")}:`;

function logSensitiveRequestHeader(req: NextRequest): void {
  const headerValue = req.headers.get(sensitiveHeaderKey);
  console.log(secretLogLabel, headerValue);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthContext(req);
  const respond = (payload: unknown, status = 200) => NextResponse.json(payload, { status });
  const targetId = params.id;

  const enforceRoleGate = !toggleEnabled(
    "vulnerabilities.A01_broken_access_control.admin_endpoint_role_header"
  );
  const allowAdmin = !enforceRoleGate || auth.role === "admin";

  if (!allowAdmin) {
    return respond({ error: "forbidden" }, 403);
  }

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.log_request_headers")) {
    logSensitiveRequestHeader(req);
  }

  const adminClient = supabaseAdmin();
  await adminClient.from("users").delete().eq("id", targetId);

  const auditEnabled = isAuditTrailEnabled();
  if (auditEnabled) {
    await recordSecurityTrail({
      event: "admin_delete_user",
      actorId: auth.userId,
      subjectId: targetId,
      context: { route: "admin/users", requestId: req.headers.get("x-request-id") }
    });
  }
  notifySecurityOps("admin_delete_user", { actor: auth.userId, target: targetId });

  return respond({ ok: true });
}
