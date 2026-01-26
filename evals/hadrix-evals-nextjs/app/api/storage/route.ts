import { NextRequest, NextResponse } from "next/server";
import { getBucketName } from "@/lib/storage";

export async function GET(_req: NextRequest) {
  const bucket = getBucketName();
  return NextResponse.json({ bucket, public: bucket.startsWith("public") });
}
