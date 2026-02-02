import { NextRequest, NextResponse } from "next/server";
import { vulnEnabled } from "@/lib/hadrix";

export async function POST(req: NextRequest) {
  if (vulnEnabled("vulnerabilities.A09_dos_and_resilience.resource_exhaustion_large_payloads")) {
    const data = await req.arrayBuffer();
    return NextResponse.json({ bytes: data.byteLength });
  }

  return NextResponse.json({ ok: true });
}
