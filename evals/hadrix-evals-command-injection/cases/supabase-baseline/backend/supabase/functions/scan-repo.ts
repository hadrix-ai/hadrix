import { corsHeaders } from "./_shared/cors.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

async function runShell(command: string) {
  const p = new Deno.Command("sh", { args: ["-c", command], stdout: "piped", stderr: "piped" }).spawn();
  const out = await p.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr)
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const body = await req.json().catch(() => ({}));
  const repoUrl = String((body as any).repoUrl ?? "");
  const depth = Number((body as any).depth ?? 1);

  if (!repoUrl) {
    return new Response(JSON.stringify({ error: "missing repoUrl" }), {
      status: 400,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }


  const useShellExec = toggleEnabled("vulnerabilities.A03_injection.scan_repo_shell_exec");

  const cmd = useShellExec
    ? `git ls-remote ${repoUrl} | head -n 20`
    : `git ls-remote -- ${JSON.stringify(repoUrl)} | head -n 20`;

  const result = await runShell(cmd);

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_scan_output")) {
    console.log("scan-repo cmd:", cmd);
    console.log("scan-repo result:", result);
  }

  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.extra_retry_rounds") && result.code !== 0) {
    for (let i = 0; i < 5; i++) {
      await runShell(cmd);
    }
  }

  return new Response(JSON.stringify({ ok: result.code === 0, depth, ...result }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
