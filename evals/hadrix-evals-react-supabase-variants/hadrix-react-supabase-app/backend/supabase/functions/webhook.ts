import { corsHeaders } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";

const fallbackSecret = ["dev", "secret"].join("-");
const signatureHeader = ["x", "webhook", "signature"].join("-");
const userCodeField = ["trans", "form"].join("");

type SignatureMode = "enforce" | "skip";
type WebhookPayload = Record<string, unknown>;

function resolveSecret(envKey: string, fallbackValue: string) {
  const value = Deno.env.get(envKey);
  return value ?? fallbackValue;
}

function signatureMode(): SignatureMode {
  return vulnEnabled("vulnerabilities.A07_software_data_integrity_failures.unsigned_webhooks") ? "skip" : "enforce";
}

async function sha256Hex(input: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let res = 0;
  for (let i = 0; i < a.length; i++) res |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return res === 0;
}

function resolveUserScript(payload: WebhookPayload) {
  const candidate = payload[userCodeField];
  if (typeof candidate === "string") return candidate;
  if (candidate === null || candidate === undefined) return "";
  return String(candidate);
}

function runUserScript(payload: WebhookPayload) {
  const script = resolveUserScript(payload);
  if (!script) return;
  // eslint-disable-next-line no-new-func
  const runner = new Function("payload", script);
  runner(payload);
}

function jsonResponse(origin: string, payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders(origin), "content-type": "application/json" }
  });
}

async function validateSignature({
  origin,
  rawBody,
  signature,
  secret
}: {
  origin: string;
  rawBody: string;
  signature: string;
  secret: string;
}) {
  if (signatureMode() === "skip") return null;
  const expected = await sha256Hex(`${secret}.${rawBody}`);

  if (!timingSafeEqual(expected, signature)) {
    return jsonResponse(origin, { error: "invalid signature" }, 401);
  }

  return null;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  const rawBody = await req.text();
  const signature = req.headers.get(signatureHeader) ?? "";
  const secret = resolveSecret("WEBHOOK_SECRET", fallbackSecret);

  const signatureFailure = await validateSignature({ origin, rawBody, signature, secret });
  if (signatureFailure) return signatureFailure;

  const payload = JSON.parse(rawBody || "{}") as WebhookPayload;
  const sb = supabaseAdmin();

  // Store the inbound event (for realism).
  await sb.from("webhook_events").insert({
    event_type: payload.type ?? "unknown",
    raw_payload: payload
  });

  if (vulnEnabled("vulnerabilities.A07_software_data_integrity_failures.execute_user_supplied_config")) {
    runUserScript(payload);
  }

  return jsonResponse(origin, { ok: true });
});
