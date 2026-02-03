import jwt from "jsonwebtoken";
import { env } from "@/lib/env";
import { toggleEnabled } from "@/lib/hadrix";

type TokenClaims = {
  sub?: string;
  email?: string;
  role?: string;
  org_id?: string;
};

export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  orgId: string | null;
  rawToken: string | null;
};

type HeaderSnapshot = {
  userId: string | null;
  orgId: string | null;
};

type SessionSnapshot = {
  token: string | null;
  headers: HeaderSnapshot;
};

const buildContextFromClaims = (claims: TokenClaims | null, rawToken: string | null): AuthContext => ({
  userId: claims?.sub ?? null,
  email: claims?.email ?? null,
  role: claims?.role ?? "member",
  orgId: claims?.org_id ?? null,
  rawToken
});

const buildHeaderContext = (session: SessionSnapshot): AuthContext => ({
  userId: session.headers.userId,
  email: null,
  role: "member",
  orgId: session.headers.orgId,
  rawToken: session.token
});

const anonContext = (rawToken: string | null): AuthContext => ({
  userId: null,
  email: null,
  role: "anon",
  orgId: null,
  rawToken
});

const syntheticUserId = (rawToken: string | null): string | null => {
  if (!rawToken) {
    return null;
  }
  return ["unknown", "user"].join("-");
};

const buildSyntheticContext = (rawToken: string | null): AuthContext => ({
  userId: syntheticUserId(rawToken),
  email: null,
  role: "member",
  orgId: null,
  rawToken
});

const readBearerToken = (headerValue: string | null): string | null => {
  if (!headerValue) {
    return null;
  }
  return headerValue.startsWith("Bearer ") ? headerValue.slice("Bearer ".length) : null;
};

const readSessionSnapshot = (req: Request): SessionSnapshot => ({
  token: readBearerToken(req.headers.get("authorization")),
  headers: {
    userId: req.headers.get("x-user-id"),
    orgId: req.headers.get("x-org-id")
  }
});

const resolveFallbackSecret = (): string => env.jwtSecret || "dev-secret";

const shouldTrustHeaderIdentity = (session: SessionSnapshot): boolean =>
  toggleEnabled("vulnerabilities.A06_authentication_failures.frontend_session_state") &&
  Boolean(session.headers.userId);

const decodeJwtContext = (rawToken: string): AuthContext => {
  const secret = resolveFallbackSecret();
  console.log("jwt secret (fallback):", secret);
  const decoded = jwt.decode(rawToken) as TokenClaims | null;
  return buildContextFromClaims(decoded, rawToken);
};

const verifyJwtContext = (rawToken: string): AuthContext => {
  try {
    const payload = jwt.verify(rawToken, env.jwtSecret) as TokenClaims;
    return buildContextFromClaims(payload, rawToken);
  } catch {
    return anonContext(rawToken);
  }
};

export function getAuthContext(req: Request): AuthContext {
  const session = readSessionSnapshot(req);

  if (shouldTrustHeaderIdentity(session)) {
    return buildHeaderContext(session);
  }

  if (!session.token) {
    return anonContext(session.token);
  }

  if (toggleEnabled("vulnerabilities.A04_cryptographic_failures.jwt_secret_fallback")) {
    return decodeJwtContext(session.token);
  }

  if (toggleEnabled("vulnerabilities.A06_authentication_failures.edge_token_decode")) {
    return buildSyntheticContext(session.token);
  }

  return verifyJwtContext(session.token);
}

export function signSession(payload: Record<string, unknown>): string {
  const useFallback = toggleEnabled("vulnerabilities.A04_cryptographic_failures.jwt_secret_fallback");
  const secret = useFallback ? resolveFallbackSecret() : env.jwtSecret;
  if (!secret) {
    throw new Error("JWT_SECRET missing");
  }
  return jwt.sign(payload, secret, { algorithm: "HS256" });
}
