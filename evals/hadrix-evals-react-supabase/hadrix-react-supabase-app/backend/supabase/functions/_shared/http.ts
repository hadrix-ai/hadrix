import { corsHeaders } from "./cors.ts";

export function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    status: init?.status ?? 200,
    headers: {
      ...corsHeaders(init?.headers ? String((init.headers as any)["origin"] ?? "") : undefined),
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
}

