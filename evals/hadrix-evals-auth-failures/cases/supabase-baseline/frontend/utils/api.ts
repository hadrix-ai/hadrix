import { env } from "@/env";
import { supabase } from "@/auth/supabaseClient";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body?: Json,
  init?: RequestInit
): Promise<T> {
  const session = (await supabase.auth.getSession()).data.session;

  const accessToken = session?.access_token ?? "";

  const res = await fetch(`${env.functionsBaseUrl}/${functionName}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`
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
