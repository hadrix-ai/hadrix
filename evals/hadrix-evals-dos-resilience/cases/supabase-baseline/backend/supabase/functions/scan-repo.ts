import { corsHeaders } from "./_shared/cors.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";

async function runShell(args: string[]) {
  const p = new Deno.Command("git", { args, stdout: "piped", stderr: "piped" }).spawn();
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

  const args = ["ls-remote", "--heads", "--", repoUrl];
  const result = await runShell(args);

  if (vulnEnabled("vulnerabilities.A09_dos_and_resilience.retry_storms") && result.code !== 0) {
    for (let i = 0; i < 5; i += 1) {
      await runShell(args);
    }
  }

  return new Response(JSON.stringify({ ok: result.code === 0, depth, ...result }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
