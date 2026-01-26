import { NextRequest, NextResponse } from "next/server";
import { vulnEnabled } from "@/lib/hadrix";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const orgId = url.searchParams.get("orgId") ?? "";

  // HADRIX_VULN: A02 Security Misconfiguration
  // Debug endpoint leaking headers and environment details when enabled.
  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_enabled")) {
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
