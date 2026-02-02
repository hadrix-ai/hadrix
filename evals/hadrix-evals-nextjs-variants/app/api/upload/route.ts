import { NextRequest, NextResponse } from "next/server";
import { vulnEnabled } from "@/lib/hadrix";

const allowUnboundedPayload = () =>
  vulnEnabled("vulnerabilities.A09_dos_and_resilience.resource_exhaustion_large_payloads");

const readPayloadSize = async (req: NextRequest) => {
  const blob = await req.blob();
  return blob.size;
};

export async function POST(req: NextRequest) {
  if (!allowUnboundedPayload()) {
    return NextResponse.json({ ok: true });
  }

  const bytes = await readPayloadSize(req);
  return NextResponse.json({ bytes });
}
