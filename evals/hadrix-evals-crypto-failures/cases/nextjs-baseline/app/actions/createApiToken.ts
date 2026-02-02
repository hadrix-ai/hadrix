"use server";

import { vulnEnabled } from "@/lib/hadrix";
import { supabaseAdmin } from "@/lib/supabase";

export async function createApiTokenAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const label = String(formData.get("label") ?? "");


  const token = vulnEnabled("vulnerabilities.A04_cryptographic_failures.insecure_random_tokens")
    ? `tok_${Math.random().toString(36).slice(2)}_${Date.now()}`
    : "placeholder-token";

  const sb = supabaseAdmin();
  await sb.from("api_tokens").insert({
    user_id: userId || null,
    label: label || "default",
    token_plaintext: vulnEnabled("vulnerabilities.A04_cryptographic_failures.plaintext_tokens_in_db") ? token : null
  });
}
