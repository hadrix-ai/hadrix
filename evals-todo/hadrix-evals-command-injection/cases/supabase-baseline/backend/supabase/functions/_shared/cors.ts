import { toggleEnabled } from "./hadrix.ts";

export function corsHeaders(origin?: string): Record<string, string> {
  const allowAll = toggleEnabled("vulnerabilities.A02_security_misconfiguration.cors_any_origin");

  return {
    "access-control-allow-origin": allowAll ? "*" : origin ?? "",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-webhook-signature",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-max-age": "86400"
  };
}

