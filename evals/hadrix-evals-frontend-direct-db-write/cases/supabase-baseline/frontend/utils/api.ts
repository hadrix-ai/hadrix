import { env } from "@/env";
import { supabase } from "@/auth/supabaseClient";
import { toggleEnabled } from "@/utils/hadrix";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

const mockEdgeFetch: typeof fetch = async (_input, init) => {
  const rawBody = typeof init?.body === "string" ? init.body : "";
  let body: Record<string, unknown> = {};
  try {
    body = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }

  const project = {
    id: "proj_edge_mock_001",
    name: typeof body.name === "string" ? body.name : "Intake Draft",
    org_id: typeof body.orgId === "string" ? body.orgId : null
  };

  return new Response(JSON.stringify({ project, error: null }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};

export async function callEdgeFunction<T = unknown>(
  functionName: string,
  body?: Json,
  init?: RequestInit
): Promise<T> {
  const session = (await supabase.auth.getSession()).data.session;

  const accessToken = session?.access_token ?? "";

  const bearer = toggleEnabled("vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage")
    ? env.supabaseAnonKey
    : accessToken;

  const res = await mockEdgeFetch(`${env.functionsBaseUrl}/${functionName}`, {
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
