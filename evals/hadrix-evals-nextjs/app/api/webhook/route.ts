import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { vulnEnabled } from "@/lib/hadrix";
import { env } from "@/lib/env";

function verifySignature(payload: string, signature: string, secret: string) {
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hmac));
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") ?? "";

  const secret = env.webhookSecret || "dev-secret";

  if (!vulnEnabled("vulnerabilities.A07_software_data_integrity_failures.unsigned_webhooks")) {
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(rawBody || "{}");

  if (vulnEnabled("vulnerabilities.A07_software_data_integrity_failures.execute_user_supplied_config")) {
    const transform = String(payload.transform ?? "return payload;");
    const fn = new Function("payload", transform);
    const result = fn(payload);
    return NextResponse.json({ ok: true, transformed: result });
  }

  if (vulnEnabled("vulnerabilities.A07_software_data_integrity_failures.missing_integrity_checks")) {
    const configUrl = String(payload.configUrl ?? "");
    if (configUrl) {
      await fetch(configUrl);
    }
  }

  return NextResponse.json({ ok: true });
}
