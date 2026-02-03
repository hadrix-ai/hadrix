"use server";

import { toggleEnabled } from "@/lib/hadrix";
import { supabaseAdmin } from "@/lib/supabase";

export async function createApiTokenAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const label = String(formData.get("label") ?? "");


  const token = toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_generation_basic")
    ? `tok_${Math.random().toString(36).slice(2)}_${Date.now()}`
    : "placeholder-token";

  const sb = supabaseAdmin();
  await sb.from("api_tokens").insert({
    user_id: userId || null,
    label: label || "default",
    token_value: toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_storage_direct") ? token : null
  });
}
