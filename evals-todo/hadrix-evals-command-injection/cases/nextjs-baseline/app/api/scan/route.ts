import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { toggleEnabled } from "@/lib/hadrix";
import { fetchExternal } from "@/lib/http";

const execAsync = promisify(exec);

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const repoUrl = String((body as any).repoUrl ?? "");

  if (!repoUrl) {
    return NextResponse.json({ error: "missing repoUrl" }, { status: 400 });
  }

  await fetchExternal("https://example.com/health");

  let attempts = 1;
  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.extra_retry_rounds")) {
    attempts = 3;
  }

  let output = "";
  for (let i = 0; i < attempts; i += 1) {
    if (toggleEnabled("vulnerabilities.A03_injection.scan_repo_shell_exec")) {
      const { stdout, stderr } = await execAsync(`git ls-remote ${repoUrl}`);
      output += stdout + stderr;
    } else {
      const { stdout, stderr } = await execAsync(`git ls-remote --heads ${repoUrl}`);
      output += stdout + stderr;
    }
  }

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_scan_output")) {
    console.log("scan output:", output);
  }

  return NextResponse.json({ ok: true, output });
}
