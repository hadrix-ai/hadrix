import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { vulnEnabled } from "@/lib/hadrix";

export function supabaseAnon() {
  return createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false }
  });
}

export function supabaseAdmin() {
  const key = vulnEnabled("vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage")
    ? env.supabaseAnonKey
    : env.supabaseServiceRoleKey;

  return createClient(env.supabaseUrl, key, {
    auth: { persistSession: false }
  });
}
