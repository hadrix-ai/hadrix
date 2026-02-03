import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { toggleEnabled } from "@/lib/hadrix";

export function supabaseAnon() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false }
  });
}

export function supabaseAdmin() {
  const key = toggleEnabled("vulnerabilities.A02_security_misconfiguration.anon_key_role_override")
    ? env.supabaseAnonKey
    : env.supabaseServiceRoleKey;

  return createClient(env.supabaseUrl, key, {
    auth: { persistSession: false }
  });
}
