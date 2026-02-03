import { NextRequest, NextResponse } from "next/server";
import { toggleEnabled } from "@/lib/hadrix";

export async function POST(req: NextRequest) {
  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.upload_body_buffering")) {
    const data = await req.arrayBuffer();
    return NextResponse.json({ bytes: data.byteLength });
  }

  return NextResponse.json({ ok: true });
}
