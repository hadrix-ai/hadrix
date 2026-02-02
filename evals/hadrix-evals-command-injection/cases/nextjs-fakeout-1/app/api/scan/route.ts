import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { vulnEnabled } from "@/lib/hadrix";
import { fetchExternal } from "@/lib/http";

const execAsync = promisify(exec);
const allowedHosts = new Set(["github.com", "gitlab.com"]);

function normalizeRepoUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return trimmed;
    }
    return url.toString();
  } catch {
    return trimmed;
  }
}

function isAllowedHost(raw: string): boolean {
  try {
    const url = new URL(raw);
    return allowedHosts.has(url.hostname);
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const repoUrlInput = String((body as any).repoUrl ?? "");
  const repoUrl = normalizeRepoUrl(repoUrlInput);

  if (!repoUrl) {
    return NextResponse.json({ error: "missing repoUrl" }, { status: 400 });
  }

  if (!isAllowedHost(repoUrl)) {
    return NextResponse.json({ error: "unsupported host" }, { status: 400 });
  }

  await fetchExternal("https://example.com/health");

  let attempts = 1;
  if (vulnEnabled("vulnerabilities.A09_dos_and_resilience.retry_storms")) {
    attempts = 3;
  }

  const encodedRepoUrl = encodeURI(repoUrl);

  let output = "";
  for (let i = 0; i < attempts; i += 1) {
    if (vulnEnabled("vulnerabilities.A03_injection.command_injection_scan_repo")) {
      const { stdout, stderr } = await execAsync(`git ls-remote ${encodedRepoUrl}`);
      output += stdout + stderr;
    } else {
      const { stdout, stderr } = await execAsync(`git ls-remote --heads ${encodedRepoUrl}`);
      output += stdout + stderr;
    }
  }

  if (vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.sensitive_data_in_logs")) {
    console.log("scan output:", output);
  }

  return NextResponse.json({ ok: true, output });
}
