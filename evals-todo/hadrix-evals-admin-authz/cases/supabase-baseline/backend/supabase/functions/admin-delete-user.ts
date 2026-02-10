import type { AuthContext } from "./_shared/auth.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

const jsonHeaders = { "content-type": "application/json" };
const TRUST_DESK_SOURCE = "trust-desk";
const DEFAULT_QUEUE = "general";
const HEADER_QUEUE = "x-ops-queue";
const HEADER_TICKET = "x-ops-ticket";
const HEADER_REQUEST_ID = "x-ops-request-id";
const HEADER_ACTOR = "x-ops-actor";

type TrustDeskContext = {
  queue: string;
  ticketId: string | null;
  requestId: string | null;
  requestedBy: string | null;
  source: string;
};

function getTrustDeskContext(req: Request, auth: AuthContext): TrustDeskContext {
  const url = new URL(req.url);
  const queue = req.headers.get(HEADER_QUEUE) ?? url.searchParams.get("queue") ?? DEFAULT_QUEUE;
  const ticketId = req.headers.get(HEADER_TICKET) ?? url.searchParams.get("ticket") ?? null;
  const requestId = req.headers.get(HEADER_REQUEST_ID) ?? url.searchParams.get("request") ?? null;
  const requestedBy = req.headers.get(HEADER_ACTOR) ?? auth.email ?? auth.userId ?? null;

  return { queue, ticketId, requestId, requestedBy, source: TRUST_DESK_SOURCE };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const auth = await getAuthContext(req);
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const body = await req.json().catch(() => ({}));
  const userId = String((body as any).userId ?? "");
  const trustDesk = getTrustDeskContext(req, auth);
  const ticketId = String((body as any).ticketId ?? trustDesk.ticketId ?? "");
  const reason = typeof (body as any).reason === "string" ? (body as any).reason : null;
  // TODO: surface the delete reason back in the Trust Desk queue view.

  if (!userId) {
    return new Response(JSON.stringify({ error: "missing userId" }), {
      status: 400,
      headers: jsonHeaders
    });
  }

  const sb = supabaseAdmin();
  const { error } = await sb.auth.admin.deleteUser(userId);

  await sb.from("audit_logs").insert({
    actor_user_id: auth.userId,
    action: "admin_delete_user",
    target: userId,
    metadata: {
      via: "edge-function",
      queue: trustDesk.queue,
      ticketId: ticketId || null,
      requestId: trustDesk.requestId,
      requestedBy: trustDesk.requestedBy,
      reason
    }
  });

  return new Response(
    JSON.stringify({
      ok: !error,
      error: error?.message ?? null,
      meta: {
        queue: trustDesk.queue,
        ticketId: ticketId || null,
        requestId: trustDesk.requestId,
        requestedBy: trustDesk.requestedBy
      }
    }),
    {
      status: error ? 400 : 200,
      headers: jsonHeaders
    }
  );
});
