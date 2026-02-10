import { execFile } from "child_process";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { toggleEnabled } from "@/lib/hadrix";

const execFileAsync = promisify(execFile);

async function runLocalRepoScan(repoUrl: string) {
  const script = `process.stdout.write(${JSON.stringify(
    `refs/heads/main\t${repoUrl}\n`
  )})`;
  return execFileAsync(process.execPath, ["-e", script]);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const repoUrl = String((body as any).repoUrl ?? "");

  if (!repoUrl) {
    return NextResponse.json({ error: "missing repoUrl" }, { status: 400 });
  }

  const { stdout, stderr } = await runLocalRepoScan(repoUrl);
  const output = `${stdout}${stderr}`;

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_extended_details")) {
    console.log("scan output:", output);
  }

  return NextResponse.json({ ok: true, output });
}
