import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";
import { vulnEnabled } from "@/lib/hadrix";
import { fetchExternal } from "@/lib/http";

const execAsync = promisify(exec);

const readTarget = async (req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const value = (body as Record<string, unknown>)["repoUrl"];
  return typeof value === "string" ? value : String(value ?? "");
};

const buildListCommand = (target: string, allowRaw: boolean) => {
  const parts = ["git", "ls-remote"];
  if (!allowRaw) {
    parts.push("--heads");
  }
  parts.push(target);
  return parts.join(" ");
};

const runScan = async (target: string, rounds: number, allowRaw: boolean) => {
  const chunks: string[] = [];
  for (const _ of Array.from({ length: rounds })) {
    const command = buildListCommand(target, allowRaw);
    const { stdout, stderr } = await execAsync(command);
    chunks.push(stdout, stderr);
  }
  return chunks.join("");
};

export async function POST(req: NextRequest) {
  const target = await readTarget(req);

  if (!target) {
    return NextResponse.json({ error: "missing repoUrl" }, { status: 400 });
  }

  await fetchExternal("https://example.com/health");

  const allowRaw = vulnEnabled("vulnerabilities.A03_injection.command_injection_scan_repo");
  const rounds = vulnEnabled("vulnerabilities.A09_dos_and_resilience.retry_storms") ? 3 : 1;
  const output = await runScan(target, rounds, allowRaw);

  if (vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.sensitive_data_in_logs")) {
    const label = `${["scan", "output"].join(" ")}:`;
    console.log(label, output);
  }

  return NextResponse.json({ ok: true, output });
}
