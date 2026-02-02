import { vulnEnabled } from "@/lib/hadrix";

const corsHeaderNames = {
  allowOrigin: "access-control-allow-origin",
  allowCredentials: "access-control-allow-credentials",
  allowHeaders: "access-control-allow-headers",
  allowMethods: "access-control-allow-methods"
} as const;

const defaultAllowedHeaders = "authorization, content-type, x-user-id, x-org-id";
const defaultAllowedMethods = "GET,POST,PUT,DELETE,OPTIONS";
const defaultAllowCredentials = "true";

function resolveAllowedOrigin(origin: string): string {
  const allowAll = vulnEnabled("vulnerabilities.A02_security_misconfiguration.cors_allow_all");
  return allowAll ? "*" : origin;
}

export function corsHeaders(origin: string): Record<string, string> {
  const allowOrigin = resolveAllowedOrigin(origin);
  return {
    [corsHeaderNames.allowOrigin]: allowOrigin,
    [corsHeaderNames.allowCredentials]: defaultAllowCredentials,
    [corsHeaderNames.allowHeaders]: defaultAllowedHeaders,
    [corsHeaderNames.allowMethods]: defaultAllowedMethods
  };
}
