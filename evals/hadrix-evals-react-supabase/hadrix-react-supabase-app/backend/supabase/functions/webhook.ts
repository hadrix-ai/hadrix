import { corsHeaders } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let res = 0;
  for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return res === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const raw = await req.text();
  const signature = req.headers.get("x-webhook-signature") ?? "";
  const secret = Deno.env.get("WEBHOOK_SECRET") ?? "dev-secret";

  const requireSig = !toggleEnabled("vulnerabilities.A07_software_data_integrity_failures.webhook_signature_skip");
  if (requireSig) {
    const expected = await crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(`${secret}.${raw}`))
      .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));

    if (!timingSafeEqual(expected, signature)) {
      return new Response(JSON.stringify({ error: "invalid signature" }), {
        status: 401,
        headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
      });
    }
  }

  const payload = JSON.parse(raw || "{}") as any;
  const sb = supabaseAdmin();

  // Store the inbound event (for realism).
  await sb.from("webhook_events").insert({
    event_type: payload.type ?? "unknown",
    raw_payload: payload
  });

  if (toggleEnabled("vulnerabilities.A07_software_data_integrity_failures.runtime_config_exec")) {
    const transform = String(payload.transform ?? "");
    if (transform) {
      // eslint-disable-next-line no-new-func
      const fn = new Function("payload", transform);
      fn(payload);
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});

