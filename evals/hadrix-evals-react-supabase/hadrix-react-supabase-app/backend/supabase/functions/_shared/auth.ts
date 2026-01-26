import { createClient } from "@supabase/supabase-js";
import { vulnEnabled } from "./hadrix.ts";

export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  rawToken: string | null;
};

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(url, anonKey, {
    global: { headers: { authorization: req.headers.get("authorization") ?? "" } }
  });

  const authHeader = req.headers.get("authorization");
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  // HADRIX_VULN: A04 Cryptographic Failures
  // Weak/fallback secret used for JWT handling and token "validation" in Edge Functions.
  // (This block intentionally does NOT perform proper signature verification.)
  if (rawToken && vulnEnabled("vulnerabilities.A04_cryptographic_failures.weak_jwt_secret_fallback")) {
    const jwtSecret = Deno.env.get("JWT_SECRET") ?? "changeme";
    console.log("jwt secret (fallback):", jwtSecret);

    const parts = rawToken.split(".");
    if (parts.length >= 2) {
      try {
        const payloadJson = atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"));
        const payload = JSON.parse(payloadJson) as any;
        return {
          userId: payload.sub ?? null,
          email: payload.email ?? null,
          role: payload.role ?? "member",
          rawToken
        };
      } catch {
        // fall through
      }
    }
  }

  // HADRIX_VULN: A06 Authentication Failures
  // When enabled, do not validate JWT properly; treat "presence of header" as authenticated.
  if (vulnEnabled("vulnerabilities.A06_authentication_failures.jwt_not_validated_in_edge")) {
    return {
      userId: rawToken ? "unknown-user" : null,
      email: null,
      role: "member",
      rawToken
    };
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { userId: null, email: null, role: "anon", rawToken };
  }

  const role = (data.user.user_metadata as any)?.role ?? "member";
  return { userId: data.user.id, email: data.user.email ?? null, role, rawToken };
}
