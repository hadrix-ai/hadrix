export function corsHeaders(origin?: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin ?? "",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400"
  };
}
