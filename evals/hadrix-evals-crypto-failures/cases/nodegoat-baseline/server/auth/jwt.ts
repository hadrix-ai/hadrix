import jwt from "jsonwebtoken";

const FALLBACK_SECRET = "nodegoat-dev-secret";

export function signSessionToken(payload: Record<string, unknown>) {
  const secret = process.env.JWT_SECRET || FALLBACK_SECRET;
  return jwt.sign(payload, secret, { algorithm: "HS256" });
}
