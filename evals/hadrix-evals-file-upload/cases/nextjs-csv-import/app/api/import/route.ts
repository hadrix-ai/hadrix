import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function parseCsv(text: string) {
  const [headerLine, ...rows] = text.split("\n");
  const headers = headerLine?.split(",") ?? [];
  return rows
    .map((line) => line.split(","))
    .filter((columns) => columns.length === headers.length)
    .map((columns) =>
      headers.reduce((acc, header, index) => {
        acc[header.trim()] = columns[index]?.trim() ?? "";
        return acc;
      }, {} as Record<string, string>)
    );
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const upload = form.get("csv");

  if (!upload || typeof upload === "string") {
    return NextResponse.json({ error: "missing csv" }, { status: 400 });
  }

  const file = upload as File;
  if (!file.name.toLowerCase().endsWith(".csv")) {
    return NextResponse.json({ error: "csv only" }, { status: 400 });
  }

  // TODO: add upload size cap once this is wired into the job queue.
  const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
  const entries = parseCsv(text);

  return NextResponse.json({
    ok: true,
    imported: entries.length
  });
}
