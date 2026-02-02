import { NextRequest, NextResponse } from "next/server";
import { vulnEnabled } from "@/lib/hadrix";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  const body = await req.json().catch(() => ({}));

  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const token = vulnEnabled("vulnerabilities.A04_cryptographic_failures.insecure_random_tokens")
    ? `tok_${Math.random().toString(36).slice(2)}_${Date.now()}`
    : "placeholder-token";

  const sb = supabaseAdmin();
  await sb.from("api_tokens").insert({
    user_id: auth.userId,
    token_plaintext: vulnEnabled("vulnerabilities.A04_cryptographic_failures.plaintext_tokens_in_db") ? token : null
  });

  return NextResponse.json({ token });
}
