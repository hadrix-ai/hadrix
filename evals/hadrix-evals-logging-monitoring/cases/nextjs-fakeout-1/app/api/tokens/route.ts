import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import hadrixConfig from "../../../../../hadrix.config.json";

type AuthContext = {
  userId: string | null;
};

function getAuthContext(req: NextRequest): AuthContext {
  return { userId: req.headers.get("x-user-id") };
}

function vulnEnabled(path: string): boolean {
  const parts = path.split(".");
  let current: any = hadrixConfig;
  for (const part of parts) {
    current = current?.[part];
  }
  return Boolean(current);
}

function redactToken(token: string): string {
  if (token.length <= 8) return "***";
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const token = `tok_${randomUUID()}`;
  const redacted = redactToken(token);

  if (vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.sensitive_data_in_logs")) {
    const meta = {
      userId: auth.userId,
      token
    };

    console.info("issued api token", { token: redacted, meta });
  }

  return NextResponse.json({ token });
}
