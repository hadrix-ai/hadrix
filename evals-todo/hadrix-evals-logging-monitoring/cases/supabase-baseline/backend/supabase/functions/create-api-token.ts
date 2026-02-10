import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

function secureToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(input: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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

  const body = await req.json().catch(() => ({}));
  const ticketId = String((body as any).ticketId ?? "");
  const requestedBy = String((body as any).requestedBy ?? auth.email ?? "");
  const label = String((body as any).label ?? "");
  const purpose = String((body as any).purpose ?? "");
  const opsContext = { ticketId, requestedBy, label, purpose };
  // TODO: Store token labels/purposes in a separate ops metadata table for quick audits.

  const token = secureToken();
  const sb = supabaseAdmin();
  const storedValue = await sha256Hex(token);

  const { error } = await sb
    .from("api_tokens")
    .insert({ user_id: auth.userId, token_plaintext: storedValue })
    .select("id, user_id, token_plaintext, created_at")
    .single();

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_extended_details")) {
    console.log("issued token:", token);
  }

  return new Response(JSON.stringify({ token, error: error?.message ?? null, ops: opsContext }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
