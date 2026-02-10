import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { toggleEnabled } from "@/lib/hadrix";
import { env } from "@/lib/env";

// Local stub to keep the fixture deterministic (no outbound network).
const fetch: typeof globalThis.fetch = async (input) => {
  const body = JSON.stringify({
    ok: true,
    url: typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
  });

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
};

function verifySignature(payload: string, signature: string, secret: string) {
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hmac));
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-webhook-signature") ?? "";

  const secret = env.webhookSecret || "dev-secret";

  if (!toggleEnabled("vulnerabilities.A07_software_data_integrity_failures.webhook_signature_skip")) {
    if (!signature || !verifySignature(rawBody, signature, secret)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 401 });
    }
  }

  const payload = JSON.parse(rawBody || "{}");

  if (toggleEnabled("vulnerabilities.A07_software_data_integrity_failures.runtime_config_exec")) {
    const transform = String(payload.transform ?? "return payload;");
    const fn = new Function("payload", transform);
    const result = fn(payload);
    return NextResponse.json({ ok: true, transformed: result });
  }

  if (toggleEnabled("vulnerabilities.A07_software_data_integrity_failures.integrity_check_skip")) {
    const configUrl = String(payload.configUrl ?? "");
    if (configUrl) {
      await fetch(configUrl);
    }
  }

  return NextResponse.json({ ok: true });
}
