import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";
import { alertSecurity, writeAuditLog } from "@/lib/audit";

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = getAuthContext(req);
  const userId = params.id;

  if (auth.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const sb = supabaseAdmin();
  await sb.from("users").delete().eq("id", userId);

  await writeAuditLog({ action: "admin_delete_user", actor: auth.userId, target: userId });
  alertSecurity("admin_delete_user", { actor: auth.userId, target: userId });

  return NextResponse.json({ ok: true });
}
