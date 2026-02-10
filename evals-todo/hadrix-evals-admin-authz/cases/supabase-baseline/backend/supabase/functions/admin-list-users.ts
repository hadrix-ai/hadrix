import type { AuthContext } from "./_shared/auth.ts";
import type { TrustDeskMetadataApi } from "./_shared/types/api/trustDeskMetadataApi.ts";
import { getAuthContext } from "./_shared/auth.ts";
import {
  TRUST_DESK_DEFAULT_QUEUE,
  TRUST_DESK_HEADER_ACTOR,
  TRUST_DESK_HEADER_QUEUE,
  TRUST_DESK_HEADER_REQUEST_ID,
  TRUST_DESK_HEADER_TICKET,
  TRUST_DESK_MAX_USERS,
  TRUST_DESK_QUERY_QUEUE,
  TRUST_DESK_QUERY_REQUEST_ID,
  TRUST_DESK_QUERY_TICKET,
  TRUST_DESK_SOURCE
} from "./_shared/config/trustDeskOpsConfig.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

const jsonHeaders = { "content-type": "application/json" };

function getTrustDeskContext(req: Request, auth: AuthContext): TrustDeskMetadataApi {
  const url = new URL(req.url);
  const queue =
    req.headers.get(TRUST_DESK_HEADER_QUEUE) ??
    url.searchParams.get(TRUST_DESK_QUERY_QUEUE) ??
    TRUST_DESK_DEFAULT_QUEUE;
  const ticketId =
    req.headers.get(TRUST_DESK_HEADER_TICKET) ??
    url.searchParams.get(TRUST_DESK_QUERY_TICKET) ??
    null;
  const requestId =
    req.headers.get(TRUST_DESK_HEADER_REQUEST_ID) ??
    url.searchParams.get(TRUST_DESK_QUERY_REQUEST_ID) ??
    null;
  const requestedBy = req.headers.get(TRUST_DESK_HEADER_ACTOR) ?? auth.email ?? auth.userId ?? null;

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

  const trustDesk = getTrustDeskContext(req, auth);
  // TODO: add cursor-based pagination for large rosters once the queue UI needs it.
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from("profiles")
    .select("id, email, role, org_id")
    .order("created_at", { ascending: false })
    .limit(TRUST_DESK_MAX_USERS);

  return new Response(
    JSON.stringify({
      users: data ?? [],
      error: error?.message ?? null,
      meta: {
        queue: trustDesk.queue,
        ticketId: trustDesk.ticketId,
        requestId: trustDesk.requestId,
        requestedBy: trustDesk.requestedBy,
        source: trustDesk.source
      }
    }),
    {
      headers: jsonHeaders
    }
  );
});
