import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "authorization, content-type, x-user-id, x-org-id",
  "access-control-allow-methods": "GET,OPTIONS"
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  const requestId = req.headers.get("x-request-id") ?? "";

  return NextResponse.json(
    {
      ok: true,
      status: "ready",
      requestId
    },
    { headers: corsHeaders }
  );
}
