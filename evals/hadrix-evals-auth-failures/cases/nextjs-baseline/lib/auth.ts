import jwt from "jsonwebtoken";
import { env } from "@/lib/env";

export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  orgId: string | null;
  rawToken: string | null;
};

export function getAuthContext(req: Request): AuthContext {
  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  const headerUserId = req.headers.get("x-user-id");
  const headerOrgId = req.headers.get("x-org-id");

  if (headerUserId) {
    return { userId: headerUserId, email: null, role: "member", orgId: headerOrgId, rawToken };
  }

  if (!rawToken) {
    return { userId: null, email: null, role: "anon", orgId: null, rawToken };
  }

  return { userId: "unknown-user", email: null, role: "member", orgId: null, rawToken };
}

export function signSession(payload: Record<string, unknown>): string {
  if (!env.jwtSecret) {
    throw new Error("JWT_SECRET missing");
  }
  return jwt.sign(payload, env.jwtSecret, { algorithm: "HS256" });
}
