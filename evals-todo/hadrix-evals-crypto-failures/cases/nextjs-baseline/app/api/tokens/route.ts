import { NextRequest, NextResponse } from "next/server";
import { toggleEnabled } from "@/lib/hadrix";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  const body = await req.json().catch(() => ({}));

  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const token = toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_generation_basic")
    ? `tok_${Math.random().toString(36).slice(2)}_${Date.now()}`
    : "placeholder-token";

  const sb = supabaseAdmin();
  await sb.from("api_tokens").insert({
    user_id: auth.userId,
    token_value: toggleEnabled("vulnerabilities.A04_cryptographic_failures.token_storage_direct") ? token : null
  });

  return NextResponse.json({ token });
}
