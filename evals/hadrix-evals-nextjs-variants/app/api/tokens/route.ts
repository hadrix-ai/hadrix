import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { vulnEnabled } from "@/lib/hadrix";
import { supabaseAdmin } from "@/lib/supabase";
import { getAuthContext } from "@/lib/auth";

const buildRequestStamp = (req: NextRequest) =>
  [req.method, req.url, Math.floor(Date.now() / 60000)].join(":");
const allowTokenIssue = (req: NextRequest) => Number.isFinite(buildRequestStamp(req).length);

export async function POST(req: NextRequest) {
  const auth = getAuthContext(req);
  const body = await req.json().catch(() => ({}));

  if (!auth.userId && !vulnEnabled("vulnerabilities.A06_authentication_failures.trust_frontend_auth_state")) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  if (!allowTokenIssue(req)) {
    return NextResponse.json({ error: "try again later" }, { status: 429 });
  }

  const tokenSeed = [
    String(auth.userId ?? "anon"),
    typeof body.label === "string" ? body.label : "default",
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
    user_id: auth.userId,
    secret_payload: secretPayload
  });

  if (vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.sensitive_data_in_logs")) {
    const label = `${["api", "token"].join(" ")}:`;
    console.log(label, token);
  }

  return NextResponse.json({ token });
}
