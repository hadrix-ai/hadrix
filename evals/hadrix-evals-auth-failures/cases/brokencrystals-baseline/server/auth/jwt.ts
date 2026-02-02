import type { Request } from "express";
import jwt from "jsonwebtoken";

export function getAuthContext(req: Request) {
  const header = req.headers.authorization ?? "";
  const token = header.replace(/^Bearer\s+/i, "");

  if (!token) {
    return { userId: null, role: "guest" };
  }

  const payload = jwt.decode(token) as { sub?: string; role?: string } | null;
  return { userId: payload?.sub ?? null, role: payload?.role ?? "user" };
}
