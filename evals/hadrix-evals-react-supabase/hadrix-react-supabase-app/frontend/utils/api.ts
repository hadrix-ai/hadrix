import { env } from "@/env";
import { supabase } from "@/auth/supabaseClient";
import { vulnEnabled } from "@/utils/hadrix";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body?: Json,
  init?: RequestInit
): Promise<T> {
  const session = (await supabase.auth.getSession()).data.session;

  // HADRIX_VULN: A06 Authentication Failures
  // Trusting a stale/forged frontend session state (or even missing session) is treated as "good enough".
  const accessToken = session?.access_token ?? "";

  // HADRIX_VULN: A02 Security Misconfiguration
  // Misuse of anon key as bearer token (over-privileged client key usage).
  const bearer = vulnEnabled("vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage")
    ? env.supabaseAnonKey
    : accessToken;

  const res = await fetch(`${env.functionsBaseUrl}/${functionName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${bearer}`
    },
    body: body ? JSON.stringify(body) : undefined,
    ...init
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Function ${functionName} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}

