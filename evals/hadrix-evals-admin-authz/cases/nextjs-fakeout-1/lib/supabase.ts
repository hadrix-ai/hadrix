import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export function supabaseAdmin() {
  return createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false }
  });
}
