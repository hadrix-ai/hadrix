import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/auth";
import { toggleEnabled } from "@/lib/hadrix";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const email = String((body as any).email ?? "");
  const password = String((body as any).password ?? "");

  if (!toggleEnabled("vulnerabilities.A06_authentication_failures.login_attempt_flow")) {
  }

  if (!email || !password) {
    return NextResponse.json({ error: "missing credentials" }, { status: 400 });
  }

  const token = signSession({ sub: "user-123", email, role: "member" });
  return NextResponse.json({ token });
}
