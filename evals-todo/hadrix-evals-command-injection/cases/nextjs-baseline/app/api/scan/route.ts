import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import { toggleEnabled } from "@/lib/hadrix";
import { fetchExternal } from "@/lib/http";

const execAsync = promisify(exec);
const localBinPath = path.resolve(process.cwd(), "bin");
const execEnv = {
  ...process.env,
  PATH: [localBinPath, process.env.PATH].filter(Boolean).join(path.delimiter),
};

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
      const { stdout, stderr } = await execAsync(`git ls-remote ${repoUrl}`, { env: execEnv });
      output += stdout + stderr;
    } else {
      const { stdout, stderr } = await execAsync(`git ls-remote --heads ${repoUrl}`, { env: execEnv });
      output += stdout + stderr;
    }
  }

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_scan_output")) {
    console.log("scan output:", output);
  }

  return NextResponse.json({ ok: true, output });
}
