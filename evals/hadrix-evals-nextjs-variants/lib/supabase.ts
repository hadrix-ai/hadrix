import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { toggleEnabled } from "@/lib/hadrix";

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

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.anon_key_role_override")) {
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
