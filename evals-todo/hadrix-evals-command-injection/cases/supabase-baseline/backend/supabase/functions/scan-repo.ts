import { corsHeaders } from "./_shared/cors.ts";
import {
  REPO_INTAKE_DEFAULT_DEPTH,
  REPO_INTAKE_DEFAULT_INTAKE_ID,
  REPO_INTAKE_DEFAULT_PURPOSE,
  REPO_INTAKE_DEFAULT_REQUESTED_BY,
  REPO_INTAKE_HEADER_INTAKE_ID,
  REPO_INTAKE_HEADER_OPERATOR
} from "./_shared/config/repoIntakeConfig.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";
import type {
  RepoIntakeCommandResultApi,
  RepoIntakeRequestApi,
  RepoIntakeResponseApi,
  RepoIntakeTicketApi
} from "./_shared/types/api/repoIntakeApi.ts";

const localBinPath = decodeURIComponent(new URL("./bin", import.meta.url).pathname);
const pathDelimiter = Deno.build.os === "windows" ? ";" : ":";
const shellEnv = {
  PATH: [localBinPath, Deno.env.get("PATH")].filter(Boolean).join(pathDelimiter)
};

async function runShell(command: string): Promise<RepoIntakeCommandResultApi> {
  const p = new Deno.Command("sh", {
    args: ["-c", command],
    env: shellEnv,
    stdout: "piped",
    stderr: "piped"
  }).spawn();
  const out = await p.output();
  return {
    code: out.code,
    stdout: new TextDecoder().decode(out.stdout),
    stderr: new TextDecoder().decode(out.stderr)
  };
}

function buildIntakeTicket(body: RepoIntakeRequestApi, headers: Headers): RepoIntakeTicketApi {
  return {
    intakeId: String(
      body.intakeId ?? headers.get(REPO_INTAKE_HEADER_INTAKE_ID) ?? REPO_INTAKE_DEFAULT_INTAKE_ID
    ),
    repoUrl: String(body.repoUrl ?? ""),
    depth: Number(body.depth ?? REPO_INTAKE_DEFAULT_DEPTH),
    requestedBy: String(
      body.requestedBy ?? headers.get(REPO_INTAKE_HEADER_OPERATOR) ?? REPO_INTAKE_DEFAULT_REQUESTED_BY
    ),
    purpose: String(body.purpose ?? REPO_INTAKE_DEFAULT_PURPOSE)
  };
}

async function runPreflight(ticket: RepoIntakeTicketApi, useShellExec: boolean) {
  // TODO: capture preflight attempts in a lightweight in-memory queue for the ops dashboard.
  const cmd = useShellExec
    ? `git ls-remote ${ticket.repoUrl} | head -n 20`
    : `git ls-remote -- ${JSON.stringify(ticket.repoUrl)} | head -n 20`;

  const result = await runShell(cmd);
  return { cmd, result };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req.headers.get("origin") ?? "") });

  const body = (await req.json().catch(() => ({}))) as RepoIntakeRequestApi;
  const intake = buildIntakeTicket(body, req.headers);

  if (!intake.repoUrl) {
    return new Response(JSON.stringify({ error: "missing repoUrl" }), {
      status: 400,
      headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
    });
  }

  const useShellExec = toggleEnabled("vulnerabilities.A03_injection.scan_repo_shell_exec");
  const { cmd, result } = await runPreflight(intake, useShellExec);

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_scan_output")) {
    console.log("scan-repo intake:", {
      intakeId: intake.intakeId,
      requestedBy: intake.requestedBy,
      purpose: intake.purpose
    });
    console.log("scan-repo cmd:", cmd);
    console.log("scan-repo result:", result);
  }

  if (toggleEnabled("vulnerabilities.A09_dos_and_resilience.extra_retry_rounds") && result.code !== 0) {
    for (let i = 0; i < 5; i++) {
      await runShell(cmd);
    }
  }

  // TODO: include a short ref summary once the intake UI adds a "preview" card.
  const payload: RepoIntakeResponseApi = { ok: result.code === 0, depth: intake.depth, ...result };

  return new Response(JSON.stringify(payload), {
    headers: { ...corsHeaders(req.headers.get("origin") ?? ""), "content-type": "application/json" }
  });
});
