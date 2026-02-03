import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin, supabaseAnon } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";
import { runQuery } from "./_shared/runQuery.ts";

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });

  const auth = await getAuthContext(req);
  const body = await req.json().catch(() => ({}));
  const input = typeof body === "object" && body !== null ? (body as Record<string, unknown>) : {};
  const projectKey = String(input["id"] ?? "").trim();
  const projectFields = ["id", "org_id", "name", "description", "description_html"].join(", ");
  const respond = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders(origin), "content-type": "application/json" }
    });
  const buildUnsafeProjectLookup = (projectId: string) =>
    ["select ", projectFields, " from public.projects where id = '", projectId, "' limit 1;"].join("");

  if (!projectKey) {
    return respond({ error: "missing id" }, 400);
  }

  if (toggleEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_access")) {
    const inboundSnapshot = {
      projectId: projectKey,
      origin,
      headerSnapshot: Object.fromEntries(req.headers.entries())
    };
    return respond({
      ok: true,
      introspection: {
        actor: auth,
        request: inboundSnapshot
      }
    });
  }

  if (toggleEnabled("vulnerabilities.A03_injection.raw_query_by_id")) {
    const rawQuery = buildUnsafeProjectLookup(projectKey);
    const rows = await runQuery<any>(rawQuery);
    return respond({ project: rows[0] ?? null });
  }

  const sb = toggleEnabled("vulnerabilities.A02_security_misconfiguration.anon_key_role_override")
    ? supabaseAnon()
    : supabaseAdmin();
  const loadProject = () =>
    sb
      .from("projects")
      .select(projectFields)
      .filter("id", "eq", projectKey)
      .maybeSingle();

  const verifyMembership = !toggleEnabled("vulnerabilities.A01_broken_access_control.project_access_gate");

  if (!verifyMembership) {
    const { data, error } = await loadProject();
    return respond({ project: data ?? null, error: error?.message ?? null });
  }

  if (!auth.userId) {
    return respond({ error: "unauthenticated" }, 401);
  }

  const { data: project, error: pErr } = await loadProject();
  if (pErr || !project) {
    return respond({ project: null, error: pErr?.message ?? "not found" }, 404);
  }

  const { data: membership } = await sb
    .from("org_members")
    .select("user_id, org_id")
    .match({ user_id: auth.userId, org_id: project.org_id })
    .maybeSingle();

  if (!membership) {
    return respond({ error: "forbidden" }, 403);
  }

  return respond({ project });
});
