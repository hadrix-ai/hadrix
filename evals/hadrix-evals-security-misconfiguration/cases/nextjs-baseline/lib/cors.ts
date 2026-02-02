import { vulnEnabled } from "@/lib/hadrix";

export function corsHeaders(origin: string): Record<string, string> {
  const allowAll = vulnEnabled("vulnerabilities.A02_security_misconfiguration.cors_allow_all");
  return {
    "access-control-allow-origin": allowAll ? "*" : origin,
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "authorization, content-type, x-user-id, x-org-id",
    "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS"
  };
}
