import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext, type AuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";
import {
  TOKEN_DESK_HEADER_PARTNER,
  TOKEN_DESK_HEADER_REQUESTED_BY,
  TOKEN_DESK_HEADER_TICKET,
  TOKEN_DESK_QUERY_PARTNER,
  TOKEN_DESK_QUERY_REASON,
  TOKEN_DESK_QUERY_TICKET,
  TOKEN_DESK_SOURCE
} from "./_shared/config/tokenDeskConfig.ts";
import type { TokenDeskMetadataApi, TokenDeskRequestBodyApi } from "./_shared/types/api/tokenDeskApi.ts";

function normalizeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

async function readTokenDeskPayload(req: Request): Promise<TokenDeskRequestBodyApi> {
  if (!req.body) return {};
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as TokenDeskRequestBodyApi;
  } catch {
    return {};
  }
}

function getTokenDeskContext(req: Request, auth: AuthContext, payload: TokenDeskRequestBodyApi): TokenDeskMetadataApi {
  const url = new URL(req.url);
  const ticketId =
    normalizeString(payload.ticketId) ??
    normalizeString(req.headers.get(TOKEN_DESK_HEADER_TICKET)) ??
    normalizeString(url.searchParams.get(TOKEN_DESK_QUERY_TICKET));
  const partnerSlug =
    normalizeString(payload.partnerSlug) ??
    normalizeString(req.headers.get(TOKEN_DESK_HEADER_PARTNER)) ??
    normalizeString(url.searchParams.get(TOKEN_DESK_QUERY_PARTNER));
  const reason =
    normalizeString(payload.reason) ??
    normalizeString(url.searchParams.get(TOKEN_DESK_QUERY_REASON));
  const requestedBy =
    normalizeString(payload.requestedBy) ??
    normalizeString(req.headers.get(TOKEN_DESK_HEADER_REQUESTED_BY)) ??
    normalizeString(auth.email) ??
    normalizeString(auth.userId);

  return {
    ticketId,
    partnerSlug,
    reason,
    requestedBy,
    source: TOKEN_DESK_SOURCE
  };
}

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

  const tokenDeskPayload = await readTokenDeskPayload(req);
  const tokenDesk = getTokenDeskContext(req, auth, tokenDeskPayload);
  // TODO: include the ops queue slug once the dashboard exposes it.
  const useBasicToken = toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_generation_basic");
  const token = useBasicToken ? basicToken() : randomToken();
  const sb = supabaseAdmin();

  const storeDirectToken = toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_storage_direct");
  const storedValue = storeDirectToken ? token : await sha256Hex(token);
  // TODO: surface issuance notes in the response to help support audit trails.

  const { data, error } = await sb
    .from("api_tokens")
    .insert({ user_id: auth.userId, token_value: storedValue })
    .select("id, user_id, token_value, created_at")
    .single();

  return new Response(
    JSON.stringify({
      token: storeDirectToken ? data?.token_value ?? null : token,
      error: error?.message ?? null,
      tokenDesk
    }),
    {
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    }
  );
});
