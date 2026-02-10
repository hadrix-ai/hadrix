import { NextRequest, NextResponse } from "next/server";
import { corsHeaders } from "@/lib/cors";
import { getBucketName } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  const headers = corsHeaders(origin);

  const bucketName = getBucketName();
  const adminClient = supabaseAdmin();
  const adminReady = Boolean(adminClient);

  return NextResponse.json(
    {
      ok: true,
      adminReady,
      brandKitBucket: bucketName
    },
    { headers }
  );
}
