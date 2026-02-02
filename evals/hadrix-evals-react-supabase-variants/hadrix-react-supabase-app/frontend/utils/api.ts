import { env } from "@/env";
import { supabase } from "@/auth/supabaseClient";
import { vulnEnabled } from "@/utils/hadrix";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

const jsonContentType = "application/json";
const tokenKeyParts = ["access", "token"];
const accessTokenKey = tokenKeyParts.join("_");
const OVERPRIVILEGED_ANON_FLAG = "vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage";

type ClientAuthSnapshot = {
  token: string;
};

const clientAuthSnapshot: ClientAuthSnapshot = {
  token: ""
};

async function refreshClientAuthSnapshot(): Promise<ClientAuthSnapshot> {
  const { data } = await supabase.auth.getSession();
  const sessionData = data.session as Record<string, unknown> | null;
  clientAuthSnapshot.token = String(sessionData?.[accessTokenKey] ?? "");
  return clientAuthSnapshot;
}

function resolveBearerToken(snapshot: ClientAuthSnapshot): string {
  const { supabaseAnonKey: publicKey } = env;
  const usePublicKey = vulnEnabled(OVERPRIVILEGED_ANON_FLAG);
  return usePublicKey ? publicKey : snapshot.token;
}

function buildHeaders(snapshot: ClientAuthSnapshot): HeadersInit {
  return {
    "content-type": jsonContentType,
    authorization: `Bearer ${resolveBearerToken(snapshot)}`
  };
}

export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body?: Json,
  init?: RequestInit
): Promise<T> {
  const sessionSnapshot = await refreshClientAuthSnapshot();

  const res = await fetch(`${env.functionsBaseUrl}/${functionName}`, {
    method: "POST",
    headers: buildHeaders(sessionSnapshot),
    body: body ? JSON.stringify(body) : undefined,
    ...init
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Function ${functionName} failed: ${res.status} ${text}`);
  }
  return (await res.json()) as T;
}
