import { releaseDeskHeaders } from "./_shared/config/releaseReadinessDeskConfig.ts";
import { corsHeaders } from "./_shared/cors.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";
import type { ReleaseDeskContextApi } from "./_shared/types/api/releaseReadinessDeskApi.ts";

async function runShell(args: string[]) {
  const p = new Deno.Command("git", {
    args,
    stdout: "piped",
    stderr: "piped",
    env: {
      GIT_ALLOW_PROTOCOL: "file",
      GIT_TERMINAL_PROMPT: "0"
    }
  }).spawn();
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
  // TODO: include a short branch summary once the desk card has room for it.
  const deskContext: ReleaseDeskContextApi = {
    ticketId: (body as any).ticketId ?? req.headers.get(releaseDeskHeaders.ticketId) ?? null,
    runId: (body as any).runId ?? req.headers.get(releaseDeskHeaders.runId) ?? null,
    requestedBy: (body as any).requestedBy ?? req.headers.get(releaseDeskHeaders.requestedBy) ?? null
  };

  if (!repoUrl) {
    return new Response(JSON.stringify({ error: "missing repoUrl" }), {
      status: 400,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const args = ["ls-remote", "--heads", "--", repoUrl];
  const result = await runShell(args);

  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.extra_retry_rounds") && result.code !== 0) {
    for (let i = 0; i < 5; i += 1) {
      await runShell(args);
    }
  }

  return new Response(JSON.stringify({ ok: result.code === 0, depth, desk: deskContext, ...result }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
