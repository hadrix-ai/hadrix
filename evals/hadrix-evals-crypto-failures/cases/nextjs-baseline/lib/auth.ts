import jwt from "jsonwebtoken";
import { env } from "@/lib/env";
import { toggleEnabled } from "@/lib/hadrix";

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

  if (!rawToken) {
    return { userId: null, email: null, role: "anon", orgId: null, rawToken };
  }

  if (toggleEnabled("vulnerabilities.A04_cryptographic_failures.jwt_secret_fallback")) {
    const secret = env.jwtSecret || "dev-secret";
    console.log("jwt secret (fallback):", secret);
    const decoded = jwt.decode(rawToken) as any;
    return {
      userId: decoded?.sub ?? null,
      email: decoded?.email ?? null,
      role: decoded?.role ?? "member",
      orgId: decoded?.org_id ?? null,
      rawToken
    };
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

export function signSession(payload: Record<string, unknown>): string {
  const useFallback = toggleEnabled("vulnerabilities.A04_cryptographic_failures.jwt_secret_fallback");
  const secret = useFallback ? env.jwtSecret || "dev-secret" : env.jwtSecret;
  if (!secret) {
    throw new Error("JWT_SECRET missing");
  }
  return jwt.sign(payload, secret, { algorithm: "HS256" });
}
