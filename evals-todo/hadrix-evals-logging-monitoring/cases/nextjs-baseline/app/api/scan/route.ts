import { execFile } from "child_process";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { toggleEnabled } from "@/lib/hadrix";

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const repoUrl = String((body as any).repoUrl ?? "");

  if (!repoUrl) {
    return NextResponse.json({ error: "missing repoUrl" }, { status: 400 });
  }

  const { stdout, stderr } = await execFileAsync("git", ["ls-remote", "--heads", repoUrl]);
  const output = `${stdout}${stderr}`;

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_extended_details")) {
    console.log("scan output:", output);
  }

  return NextResponse.json({ ok: true, output });
}
