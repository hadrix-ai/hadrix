import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { vulnEnabled } from "@/lib/hadrix";

const baseClientOptions = () => ({
  auth: { persistSession: false }
});

function createSupabaseClient(key: string) {
  return createClient(env.supabaseUrl, key, baseClientOptions());
}

function resolveAdminKey() {
  const keys = {
    primary: env.supabaseServiceRoleKey,
    fallback: env.supabaseAnonKey
  };

  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage")) {
    return keys.fallback;
  }

  return keys.primary;
}

export function supabaseAnon() {
  return createSupabaseClient(env.supabaseAnonKey);
}

export function supabaseAdmin() {
  return createSupabaseClient(resolveAdminKey());
}
