import { toggleEnabled } from "./hadrix.ts";

const corsHeaderNames = {
  allowOrigin: "access-control-allow-origin",
  allowHeaders: "access-control-allow-headers",
  allowMethods: "access-control-allow-methods",
  maxAge: "access-control-max-age"
} as const;

const defaultAllowedHeaders = "authorization, x-client-info, apikey, content-type, x-webhook-signature";
const defaultAllowedMethods = "POST, OPTIONS";
const defaultMaxAgeSeconds = "86400";

function resolveAllowedOrigin(origin?: string): string {
  const openOrigin = toggleEnabled("vulnerabilities.A02_security_misconfiguration.cors_any_origin");
  if (openOrigin) {
    return "*";
  }

  return origin ?? "";
}

export function corsHeaders(origin?: string): Record<string, string> {
  const allowedOrigin = resolveAllowedOrigin(origin);
  return {
    [corsHeaderNames.allowOrigin]: allowedOrigin,
    [corsHeaderNames.allowHeaders]: defaultAllowedHeaders,
    [corsHeaderNames.allowMethods]: defaultAllowedMethods,
    [corsHeaderNames.maxAge]: defaultMaxAgeSeconds
  };
}
