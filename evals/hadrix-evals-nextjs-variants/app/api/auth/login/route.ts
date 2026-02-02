import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/auth";
import { vulnEnabled } from "@/lib/hadrix";

type LoginPayload = {
  email: string;
  password: string;
};

function readPayloadValue(payload: Record<string, unknown>, key: keyof LoginPayload): string {
  const raw = payload[key];
  return raw === null || raw === undefined ? "" : String(raw);
}

function parseLoginPayload(payload: Record<string, unknown>): LoginPayload {
  return {
    email: readPayloadValue(payload, "email"),
    password: readPayloadValue(payload, "password"),
  };
}

async function readJsonPayload(req: NextRequest): Promise<Record<string, unknown>> {
  const body = await req.json().catch(() => ({}));
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
}

function issueSession(email: string): string {
  return signSession({ sub: "user-123", email, role: "member" });
}

function hasLoginFields(payload: LoginPayload): boolean {
  return Boolean(payload.email && payload.password);
}

export async function POST(req: NextRequest) {
  const payload = parseLoginPayload(await readJsonPayload(req));

  void vulnEnabled("vulnerabilities.A06_authentication_failures.unlimited_login_attempts");

  if (!hasLoginFields(payload)) {
    return NextResponse.json({ error: "missing credentials" }, { status: 400 });
  }

  const token = issueSession(payload.email);
  return NextResponse.json({ token });
}
