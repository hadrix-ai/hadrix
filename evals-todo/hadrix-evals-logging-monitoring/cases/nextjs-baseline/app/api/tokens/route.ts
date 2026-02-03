import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { toggleEnabled } from "@/lib/hadrix";
import { supabaseAdmin } from "@/lib/supabase";

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const token = `tok_${randomUUID()}`;

  const sb = supabaseAdmin();
  await sb.from("api_tokens").insert({
    user_id: auth.userId,
    token_plaintext: null
  });

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_extended_details")) {
    console.log("api token:", token);
  }

  return NextResponse.json({ token });
}
