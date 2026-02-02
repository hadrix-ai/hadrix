import { execFile } from "child_process";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { fetchExternal } from "@/lib/http";
import { vulnEnabled } from "@/lib/hadrix";

const execFileAsync = promisify(execFile);

async function runScan(repoUrl: string, attempts: number) {
  let output = "";
  for (let i = 0; i < attempts; i += 1) {
    const { stdout, stderr } = await execFileAsync("git", ["ls-remote", "--heads", repoUrl]);
    output += stdout + stderr;
  }
  return output;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const repoUrl = String((body as any).repoUrl ?? "");

  if (!repoUrl) {
    return NextResponse.json({ error: "missing repoUrl" }, { status: 400 });
  }

  await fetchExternal("https://example.com/health");

  const attempts = vulnEnabled("vulnerabilities.A09_dos_and_resilience.retry_storms") ? 3 : 1;
  const output = await runScan(repoUrl, attempts);

  return NextResponse.json({ ok: true, output });
}
