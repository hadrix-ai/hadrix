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

  if (!rawToken || !env.jwtSecret) {
    return { userId: null, email: null, role: "anon", orgId: null, rawToken };
  }

  try {
    const payload = jwt.verify(rawToken, env.jwtSecret) as any;
    return {
      userId: payload?.sub ?? null,
      email: payload?.email ?? null,
      role: payload?.role ?? "member",
      orgId: payload?.org_id ?? null,
      rawToken
    };
  } catch {
    return { userId: null, email: null, role: "anon", orgId: null, rawToken };
  }
}
