import { NextRequest, NextResponse } from "next/server";
import { toggleEnabled } from "@/lib/hadrix";

const allowUnboundedPayload = () =>
  toggleEnabled("vulnerabilities.A09_dos_and_resilience.upload_body_buffering");

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
