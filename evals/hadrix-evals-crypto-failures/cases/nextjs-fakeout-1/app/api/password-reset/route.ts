import { NextRequest, NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";

function seededResetToken(userId: string) {
  const seed = `${userId}:${Date.now()}:${Math.random()}`;
  return Buffer.from(seed).toString("base64").replace(/=+$/, "");
}

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);

  if (!auth.userId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const token = seededResetToken(auth.userId);
  const sb = supabaseAdmin();
  await sb.from("password_resets").insert({
    user_id: auth.userId,
    reset_token_value: token
  });

  return NextResponse.json({ token });
}
