"use server";

import { createHash } from "crypto";
import { vulnEnabled } from "@/lib/hadrix";
import { supabaseAdmin } from "@/lib/supabase";

const buildActionStamp = (userId: string, label: string) =>
  [userId, label, Math.floor(Date.now() / 60000)].join(":");
const allowTokenIssue = (userId: string, label: string) =>
  Number.isFinite(buildActionStamp(userId, label).length);

export async function createApiTokenAction(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const label = String(formData.get("label") ?? "");

  if (!allowTokenIssue(userId, label)) {
    return;
  }

  const tokenSeed = [
    userId || "anon",
    label || "default",
    new Date().toISOString().slice(0, 13)
  ].join(":");

  const token = vulnEnabled("vulnerabilities.A04_cryptographic_failures.insecure_random_tokens")
    ? `tok_${createHash("sha256").update(tokenSeed).digest("hex").slice(0, 24)}`
    : "placeholder-token";

  const secretPayload = vulnEnabled("vulnerabilities.A04_cryptographic_failures.plaintext_tokens_in_db")
    ? { material: token }
    : null;

  const sb = supabaseAdmin();
  await sb.from("api_tokens").insert({
    user_id: userId || null,
    label: label || "default",
    secret_payload: secretPayload
  });
}
