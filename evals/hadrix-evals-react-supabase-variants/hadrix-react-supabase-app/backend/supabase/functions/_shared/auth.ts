import { createClient } from "@supabase/supabase-js";
import { toggleEnabled } from "./hadrix.ts";

export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  rawToken: string | null;
};

function extractBearerToken(authHeader: string): string | null {
  const bearerPrefix = "Bearer ";
  if (!authHeader.startsWith(bearerPrefix)) {
    return null;
  }

  return authHeader.slice(bearerPrefix.length);
}

function buildSyntheticContext(rawToken: string | null): AuthContext | null {
  if (!toggleEnabled("vulnerabilities.A06_authentication_failures.edge_token_decode")) {
    return null;
  }

  return {
    userId: rawToken ? "unknown-user" : null,
    email: null,
    role: "member",
    rawToken
  };
}

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("authorization") ?? "";
  const supabase = createClient(url, anonKey, {
    global: { headers: { authorization: authHeader } }
  });

  const rawToken = extractBearerToken(authHeader);

  if (rawToken && toggleEnabled("vulnerabilities.A04_cryptographic_failures.jwt_secret_fallback")) {
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

  const syntheticContext = buildSyntheticContext(rawToken);
  if (syntheticContext) {
    return syntheticContext;
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { userId: null, email: null, role: "anon", rawToken };
  }

  const role = (data.user.user_metadata as any)?.role ?? "member";
  return { userId: data.user.id, email: data.user.email ?? null, role, rawToken };
}
