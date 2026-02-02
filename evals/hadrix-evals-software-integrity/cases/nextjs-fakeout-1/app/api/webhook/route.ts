import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { vulnEnabled } from "@/lib/hadrix";
import { env } from "@/lib/env";

const fallbackSecretParts = ["dev", "secret"];
const signatureHeaderName = ["x", "webhook", "signature"].join("-");

const resolveWebhookSecret = (configured: string): string =>
  configured || fallbackSecretParts.join("-");

function verifySignature(payload: string, signature: string, secret: string) {
  const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hmac));
}

const isSignatureValid = (payload: string, signature: string, secret: string) => {
  if (!signature) {
    return false;
  }
  return verifySignature(payload, signature, secret);
};

const defaultTransformSource = "return payload;";

const resolveTransformSource = (payload: { transform?: unknown }) =>
  String(payload.transform ?? defaultTransformSource);

const runUserTransform = (payload: { transform?: unknown }) => {
  const source = resolveTransformSource(payload);
  const factory = Function;
  const runner = factory("payload", source);
  return runner(payload);
};

const externalConfigKey = ["config", "Url"].join("");

const resolveExternalConfigLocation = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return "";
  }
  const record = payload as Record<string, unknown>;
  return String(record[externalConfigKey] ?? "");
};

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get(signatureHeaderName) ?? "";

  const secret = resolveWebhookSecret(env.webhookSecret);

  const signatureRequired = !vulnEnabled("vulnerabilities.A07_software_data_integrity_failures.unsigned_webhooks");
  const acceptRequest = !signatureRequired || isSignatureValid(rawBody, signature, secret);
  if (!acceptRequest) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody || "{}");

  if (vulnEnabled("vulnerabilities.A07_software_data_integrity_failures.execute_user_supplied_config")) {
    const result = runUserTransform(payload);
    return NextResponse.json({ ok: true, transformed: result });
  }

  if (vulnEnabled("vulnerabilities.A07_software_data_integrity_failures.missing_integrity_checks")) {
    const configLocation = resolveExternalConfigLocation(payload);
    if (configLocation) {
      await fetch(configLocation);
    }
  }

  return NextResponse.json({ ok: true });
}
