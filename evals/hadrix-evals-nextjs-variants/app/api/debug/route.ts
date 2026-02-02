import { NextRequest, NextResponse } from "next/server";
import { vulnEnabled } from "@/lib/hadrix";

function readOrgId(req: NextRequest): string {
  const url = new URL(req.url);
  return url.searchParams.get("orgId") ?? "";
}

function collectHeaders(req: NextRequest): Record<string, string> {
  const snapshot: Record<string, string> = {};
  for (const [name, value] of req.headers.entries()) {
    snapshot[name] = value;
  }
  return snapshot;
}

function collectEnv(): Record<string, string> {
  const snapshot: Record<string, string> = {};
  const nodeEnv = process.env.NODE_ENV;
  const jwtSecret = process.env.JWT_SECRET;

  if (nodeEnv !== undefined) {
    snapshot.nodeEnv = nodeEnv;
  }

  if (jwtSecret !== undefined) {
    snapshot.jwtSecret = jwtSecret;
  }

  return snapshot;
}

export async function GET(req: NextRequest) {
  const orgId = readOrgId(req);

  if (!vulnEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_enabled")) {
    return NextResponse.json({ ok: true });
  }

  const payload = {
    debug: true,
    orgId,
    headers: collectHeaders(req),
    env: collectEnv()
  };

  return NextResponse.json(payload);
}
