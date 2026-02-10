import { env } from "@/env";
import { supabase } from "@/auth/supabaseClient";
import { toggleEnabled } from "@/utils/hadrix";

type Json = Record<string, unknown> | Array<unknown> | string | number | boolean | null;

type AdminUser = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

const localRoster: AdminUser[] = [
  { id: "steward_01", email: "mara@brokencrystals.test", role: "support", org_id: "ops" },
  { id: "steward_02", email: "jules@brokencrystals.test", role: "moderator", org_id: "ops" },
  { id: "steward_03", email: "rory@brokencrystals.test", role: "member", org_id: "guild-44" }
];

function readUserId(body?: Json): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return null;
  }
  const candidate = (body as Record<string, unknown>).userId;
  return typeof candidate === "string" ? candidate : null;
}

function runLocalFunction<T>(functionName: string, body?: Json): T {
  if (functionName === "admin-list-users") {
    return { users: [...localRoster] } as T;
  }

  if (functionName === "admin-delete-user") {
    const userId = readUserId(body);
    if (userId) {
      const index = localRoster.findIndex((user) => user.id === userId);
      if (index >= 0) {
        localRoster.splice(index, 1);
      }
    }
    return { ok: true } as T;
  }

  throw new Error(`Function ${functionName} failed: 404 not found`);
}

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

  void init;
  void bearer;

  return runLocalFunction<T>(functionName, body);
}
