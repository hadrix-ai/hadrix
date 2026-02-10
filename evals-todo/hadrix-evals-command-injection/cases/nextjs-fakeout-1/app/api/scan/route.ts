import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import os from "os";
import path from "path";
import { toggleEnabled } from "@/lib/hadrix";
import { fetchExternal } from "@/lib/http";

const execAsync = promisify(exec);
const allowedHosts = new Set(["github.com", "gitlab.com"]);
const localBinPath = path.join(os.tmpdir(), "hadrix-nextjs-fakeout-1-bin");
const localGitPath = path.join(localBinPath, "git");
const execEnv = {
  ...process.env,
  PATH: [localBinPath, process.env.PATH].filter(Boolean).join(path.delimiter),
};

const gitShimScript = [
  "#!/usr/bin/env node",
  "",
  "const args = process.argv.slice(2);",
  "const isLsRemote = args[0] === \"ls-remote\";",
  "const hasHeadsFlag = args.includes(\"--heads\");",
  "",
  "const HEADS = [",
  "  \"7c0f5df8c4c9f8a9d3b1f9f7c2a1d7e5f3b2a1c0\\trefs/heads/main\",",
  "  \"5d2b9c1e8a3f7b6c4a9d0e1f2b3c4d5e6f7a8b9c\\trefs/heads/release\",",
  "];",
  "",
  "const TAGS = [\"4a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b\\trefs/tags/v0.2.0\"];",
  "",
  "if (!isLsRemote) {",
  "  process.stdout.write(\"\");",
  "  process.exit(0);",
  "}",
  "",
  "const output = hasHeadsFlag ? HEADS : HEADS.concat(TAGS);",
  "",
  "process.stdout.write(output.join(\"\\n\") + \"\\n\");",
  "",
].join("\n");

function ensureLocalGitShim() {
  if (fs.existsSync(localGitPath)) {
    return;
  }

  fs.mkdirSync(localBinPath, { recursive: true });
  fs.writeFileSync(localGitPath, gitShimScript, { mode: 0o755 });
}

ensureLocalGitShim();

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
  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.extra_retry_rounds")) {
    attempts = 3;
  }

  const encodedRepoUrl = encodeURI(repoUrl);

  let output = "";
  for (let i = 0; i < attempts; i += 1) {
    if (toggleEnabled("vulnerabilities.A03_injection.scan_repo_shell_exec")) {
      const { stdout, stderr } = await execAsync(`git ls-remote ${encodedRepoUrl}`, { env: execEnv });
      output += stdout + stderr;
    } else {
      const { stdout, stderr } = await execAsync(`git ls-remote --heads ${encodedRepoUrl}`, { env: execEnv });
      output += stdout + stderr;
    }
  }

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_scan_output")) {
    console.log("scan output:", output);
  }

  return NextResponse.json({ ok: true, output });
}
