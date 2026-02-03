import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

const buildRequestStamp = (req: Request) =>
  [req.method, req.url, Math.floor(Date.now() / 60000)].join(":");
const allowProjectCreate = (req: Request) => Number.isFinite(buildRequestStamp(req).length);

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  const auth = await getAuthContext(req);
  const body = await req.json().catch(() => ({}));
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const readString = (key: string) => String(input[key] ?? "");
  const legacyScopeKey = ["org", "Id"].join("");
  const name = readString("name");
  const scopeHint = readString(legacyScopeKey);
  const description = readString("description");
  const descriptionHtml = readString("descriptionHtml");
  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders(origin), "content-type": "application/json" }
    });

  if (!name) {
    return respond({ error: "missing name" }, 400);
  }

  if (!auth.userId && !toggleEnabled("vulnerabilities.A06_authentication_failures.frontend_session_state")) {
    return respond({ error: "unauthenticated" }, 401);
  }

  if (!allowProjectCreate(req)) {
    return respond({ error: "try again later" }, 429);
  }

  const allowClientScope =
    toggleEnabled("vulnerabilities.A01_broken_access_control.client_org_scope_override") ||
    toggleEnabled("vulnerabilities.A05_insecure_design.client_org_id_source");

  const scopedOrgId = allowClientScope ? scopeHint : "";

  const sb = supabaseAdmin();

  const { data, error } = await sb
    .from("projects")
    .insert({
      name,
      org_id: scopedOrgId ? scopedOrgId : null,
      description: description || null,
      description_html: descriptionHtml || null,
      created_by: auth.userId
    })
    .select("id, org_id, name")
    .single();

  if (toggleEnabled("vulnerabilities.A08_logging_monitoring_failures.log_extended_details")) {
    console.log("create-project body:", body);
  }

  return respond({ project: data ?? null, error: error?.message ?? null }, error ? 400 : 200);
});
