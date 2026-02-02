import { corsHeaders } from "./_shared/cors.ts";
import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin, supabaseAnon } from "./_shared/supabase.ts";
import { vulnEnabled } from "./_shared/hadrix.ts";
import { unsafeSql } from "./_shared/unsafeSql.ts";

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

  if (vulnEnabled("vulnerabilities.A02_security_misconfiguration.debug_endpoint_enabled")) {
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

  if (vulnEnabled("vulnerabilities.A03_injection.sql_injection_raw_query")) {
    const rawQuery = buildUnsafeProjectLookup(projectKey);
    const rows = await unsafeSql<any>(rawQuery);
    return respond({ project: rows[0] ?? null });
  }

  const sb = vulnEnabled("vulnerabilities.A02_security_misconfiguration.overprivileged_anon_key_usage")
    ? supabaseAnon()
    : supabaseAdmin();
  const loadProject = () =>
    sb
      .from("projects")
      .select(projectFields)
      .filter("id", "eq", projectKey)
      .maybeSingle();

  const verifyMembership = !vulnEnabled("vulnerabilities.A01_broken_access_control.idor_get_project");

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
