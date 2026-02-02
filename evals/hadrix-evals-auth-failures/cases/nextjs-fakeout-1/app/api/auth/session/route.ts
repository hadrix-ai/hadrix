import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";

type SessionPayload = {
  sub?: string;
  email?: string;
  role?: string;
  exp?: number;
};

export async function GET(req: NextRequest) {
  const rawToken = req.cookies.get("session")?.value ?? "";

  if (!rawToken) {
    return NextResponse.json({ error: "missing session" }, { status: 401 });
  }

  const payload = jwt.decode(rawToken) as SessionPayload | null;
  if (!payload?.sub) {
    return NextResponse.json({ error: "invalid session" }, { status: 401 });
  }

  return NextResponse.json({
    userId: payload.sub,
    email: payload.email ?? null,
    role: payload.role ?? "member"
  });
}
