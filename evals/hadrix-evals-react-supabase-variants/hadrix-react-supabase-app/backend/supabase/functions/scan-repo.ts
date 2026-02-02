import { corsHeaders } from "./_shared/cors.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";

type ShellResult = {
  code: number;
  stdout: string;
  stderr: string;
};

const decoder = new TextDecoder();

async function runShell(command: string): Promise<ShellResult> {
  const p = new Deno.Command("sh", { args: ["-c", command], stdout: "piped", stderr: "piped" }).spawn();
  const out = await p.output();
  return {
    code: out.code,
    stdout: decoder.decode(out.stdout),
    stderr: decoder.decode(out.stderr)
  };
}

async function runBurst(command: string, count: number) {
  for (let attempt = 0; attempt < count; attempt++) {
    await runShell(command);
  }
}

function buildListCommand(remoteUrl: string, allowRaw: boolean) {
  const base = ["git", "ls-remote"].join(" ");
  const limiter = ["|", "head", "-n", "20"].join(" ");
  const target = allowRaw ? remoteUrl : `-- ${JSON.stringify(remoteUrl)}`;
  return `${base} ${target} ${limiter}`;
}

async function runListing(command: string, repeatOnFailure: boolean) {
  const result = await runShell(command);
  if (repeatOnFailure && result.code !== 0) {
    await runBurst(command, 5);
  }
  return result;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const body = await req.json().catch(() => ({}));
  const remoteUrl = String((body as any).repoUrl ?? "");
  const depth = Number((body as any).depth ?? 1);

  if (!remoteUrl) {
    return new Response(JSON.stringify({ error: "missing repoUrl" }), {
      status: 400,
      headers: { ...cors, "content-type": "application/json" }
    });
  }


  const allowRaw = vulnEnabled("vulnerabilities.A03_injection.command_injection_scan_repo");
  const allowBurst = vulnEnabled("vulnerabilities.A09_dos_and_resilience.retry_storms");
  const cmd = buildListCommand(remoteUrl, allowRaw);
  const result = await runListing(cmd, allowBurst);

  if (vulnEnabled("vulnerabilities.A08_logging_monitoring_failures.sensitive_data_in_logs")) {
    console.log("scan-repo cmd:", cmd);
    console.log("scan-repo result:", result);
  }

  return new Response(JSON.stringify({ ok: result.code === 0, depth, ...result }), {
    headers: { ...cors, "content-type": "application/json" }
  });
});
