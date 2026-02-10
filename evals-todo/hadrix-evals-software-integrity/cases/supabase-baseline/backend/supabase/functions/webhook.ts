import type { ReplayDeskContextApi } from "./_shared/types/api/replayDeskContextApi.ts";
import {
  REPLAY_DESK_METADATA_FIELD,
  REPLAY_DESK_PAYLOAD_KEYS,
  REPLAY_DESK_SOURCE
} from "./_shared/config/replayDeskConfig.ts";
import { corsHeaders } from "./_shared/cors.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

function readReplayDeskField(payload: Record<string, unknown>, key: string): string | null {
  const value = payload[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveReplayDeskContext(payload: unknown): ReplayDeskContextApi | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const ticketId = readReplayDeskField(record, REPLAY_DESK_PAYLOAD_KEYS.ticketId);
  const runId = readReplayDeskField(record, REPLAY_DESK_PAYLOAD_KEYS.runId);
  const requestedBy = readReplayDeskField(record, REPLAY_DESK_PAYLOAD_KEYS.requestedBy);

  if (!ticketId && !runId && !requestedBy) return null;
  return { source: REPLAY_DESK_SOURCE, ticketId, runId, requestedBy };
}

function applyReplayDeskContext(payload: unknown, replayDesk: ReplayDeskContextApi | null): unknown {
  if (!replayDesk || !payload || typeof payload !== "object") return payload;
  const record = payload as Record<string, unknown>;
  if (record[REPLAY_DESK_METADATA_FIELD] && typeof record[REPLAY_DESK_METADATA_FIELD] === "object") {
    return payload;
  }
  return { ...record, [REPLAY_DESK_METADATA_FIELD]: replayDesk };
}

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
  const replayDesk = resolveReplayDeskContext(payload);
  const eventPayload = applyReplayDeskContext(payload, replayDesk);
  const sb = supabaseAdmin();

  // Store the inbound event (for realism).
  // TODO: persist replay desk context in a separate audit table once the schema lands.
  await sb.from("webhook_events").insert({
    event_type: payload.type ?? "unknown",
    raw_payload: eventPayload
  });

  if (toggleEnabled("vulnerabilities.A07_software_data_integrity_failures.runtime_config_exec")) {
    const transform = String(payload.transform ?? "");
    if (transform) {
      // eslint-disable-next-line no-new-func
      const fn = new Function("payload", transform);
      fn(payload);
    }
  }

  // TODO: include signature status in the support replay summary payload.
  const responseBody = replayDesk ? { ok: true, replayDesk } : { ok: true };
  return new Response(JSON.stringify(responseBody), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
