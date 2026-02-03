import fs from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const upload = form.get("file");

  if (!upload || typeof upload === "string") {
    return NextResponse.json({ error: "missing file" }, { status: 400 });
  }

  const file = upload as File;
  const bytes = Buffer.from(await file.arrayBuffer());
  const uploadDir = path.join(process.cwd(), "public", "uploads");

  await fs.mkdir(uploadDir, { recursive: true });
  await fs.writeFile(path.join(uploadDir, file.name), bytes);

  return NextResponse.json({
    ok: true,
    url: `/uploads/${file.name}`
  });
}
