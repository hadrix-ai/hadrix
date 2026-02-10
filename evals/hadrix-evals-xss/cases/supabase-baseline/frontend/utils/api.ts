import { env } from "@/env";
import { callLocalEdgeFunction } from "@/mock/edgeFunctions";
import { toggleEnabled } from "@/utils/hadrix";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

const LOCAL_ACCESS_TOKEN = "local-session-token";

async function resolveAccessToken(): Promise<string> {
  return LOCAL_ACCESS_TOKEN;
}

export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body?: Json,
  init?: RequestInit
): Promise<T> {
  const accessToken = await resolveAccessToken();

  const bearer = toggleEnabled("vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage")
    ? env.supabaseAnonKey
    : accessToken;

  void init;
  return (await Promise.resolve(callLocalEdgeFunction(functionName, body, bearer))) as T;
}
