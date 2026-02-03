import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

function basicToken() {
  return `${Math.random().toString(36).slice(2)}.${Date.now()}`;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
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

  const useBasicToken = toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_generation_basic");
  const token = useBasicToken ? basicToken() : randomToken();
  const sb = supabaseAdmin();

  const storeDirectToken = toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_storage_direct");
  const storedValue = storeDirectToken ? token : await sha256Hex(token);

  const { data, error } = await sb
    .from("api_tokens")
    .insert({ user_id: auth.userId, token_value: storedValue })
    .select("id, user_id, token_value, created_at")
    .single();

  return new Response(JSON.stringify({ token: storeDirectToken ? data?.token_value ?? null : token, error: error?.message ?? null }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
