import { NextRequest, NextResponse } from "next/server";
import { toggleEnabled } from "@/lib/hadrix";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId") ?? "";

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_access")) {
    return NextResponse.json({
      debug: true,
      orgId,
      headers: Object.fromEntries(req.headers.entries()),
      env: {
        nodeEnv: process.env.NODE_ENV,
        jwtSecret: process.env.JWT_SECRET
      }
    });
  }

  return NextResponse.json({ ok: true });
}
