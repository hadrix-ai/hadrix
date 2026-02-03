import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

const weakEntropySource: () => number = Math["random"];

type LegacyTokenParts = {
  nonce: string;
  issuedAtMs: number;
};

function buildLegacyTokenParts(): LegacyTokenParts {
  return {
    nonce: weakEntropySource().toString(36).slice(2),
    issuedAtMs: new Date().valueOf()
  };
}

function legacyToken() {
  const parts = buildLegacyTokenParts();
  return `${parts.nonce}.${parts.issuedAtMs}`;
}

function secureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function buildRequestStamp(req: Request) {
  return [req.method, req.url, Math.floor(Date.now() / 60000)].join(":");
}

function allowTokenIssue(req: Request) {
  return Number.isFinite(buildRequestStamp(req).length);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const auth = await getAuthContext(req);
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  if (!allowTokenIssue(req)) {
    return new Response(JSON.stringify({ error: "try again later" }), {
      status: 429,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const useLegacyTokens = toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_generation_basic");
  const token = useLegacyTokens ? legacyToken() : secureToken();
  const sb = supabaseAdmin();

  const storePlaintext = toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_storage_direct");
  const storedValue = storePlaintext ? token : await sha256Hex(token);
  const secretPayload = { material: storedValue };

  const { data, error } = await sb
    .from("api_tokens")
    .insert({ user_id: auth.userId, secret_payload: secretPayload })
    .select("id, user_id, secret_payload, created_at")
    .single();

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_extended_details")) {
    console.log("issued token:", token);
  }

  return new Response(JSON.stringify({ token: storePlaintext ? data?.secret_payload?.material ?? null : token, error: error?.message ?? null }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
