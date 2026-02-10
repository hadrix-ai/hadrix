import { corsHeaders } from "./_shared/cors.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";
import { OPS_TOOLKIT_CONFIG } from "./_shared/config/opsToolkitConfig.ts";
import type { OpsToolkitContextApi } from "./_shared/types/api/opsToolkitOpsApi.ts";

async function runShell(args: string[]) {
  const repoArg = args[args.length - 1] ?? "";
  const stdout = "4c1f90d0\trefs/heads/main\n";
  const stderr = repoArg ? `remote: ${repoArg}\n` : "";
  return {
    code: 0,
    stdout,
    stderr
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const body = await req.json().catch(() => ({}));
  const repoUrl = String((body as any).repoUrl ?? "");
  const depth = Number((body as any).depth ?? OPS_TOOLKIT_CONFIG.scan.defaultDepth);
  const ticketId = String((body as any).ticketId ?? OPS_TOOLKIT_CONFIG.contextDefaults.ticketId);
  const requestedBy = String((body as any).requestedBy ?? OPS_TOOLKIT_CONFIG.contextDefaults.requestedBy);
  const purpose = String((body as any).purpose ?? OPS_TOOLKIT_CONFIG.contextDefaults.purpose);
  const opsContext: OpsToolkitContextApi = { ticketId, requestedBy, purpose };
  // TODO: Capture repo host + depth in a lightweight scan ledger for the ops dashboard.

  if (!repoUrl) {
    return new Response(JSON.stringify({ error: "missing repoUrl" }), {
      status: 400,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const args = ["ls-remote", "--heads", "--", repoUrl];
  const result = await runShell(args);

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_extended_details")) {
    console.log("scan-repo cmd:", args.join(" "));
    console.log("scan-repo result:", result);
  }

  return new Response(JSON.stringify({ ok: result.code === 0, depth, ops: opsContext, ...result }), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
