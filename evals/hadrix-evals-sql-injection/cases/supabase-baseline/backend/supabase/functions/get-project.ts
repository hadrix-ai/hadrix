import { getAuthContext } from "./_shared/auth.ts";
import { buildOpsSnapshotContext } from "./_shared/opsSnapshot/helpers/opsSnapshotContext.ts";
import type { OpsSnapshotApiRequestBody } from "./_shared/opsSnapshot/types/api/opsSnapshotApi.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { runQuery } from "./_shared/runQuery.ts";

const jsonHeaders = { "content-type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const auth = await getAuthContext(req);
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "unauthenticated" }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "");
  const opsSnapshot = buildOpsSnapshotContext(body as OpsSnapshotApiRequestBody);

  if (!id) {
    return new Response(JSON.stringify({ error: "missing id" }), {
      status: 400,
      headers: jsonHeaders
    });
  }

  const sb = supabaseAdmin();
  const { data: membership } = await sb
    .from("org_members")
    .select("org_id")
    .eq("user_id", auth.userId)
    .maybeSingle();

  if (!membership) {
    return new Response(JSON.stringify({ error: "forbidden" }), {
      status: 403,
      headers: jsonHeaders
    });
  }

  // TODO: cache org membership lookups when ops snapshot fan-out grows.
  const sql =
    `select id, org_id, name, description, description_html from public.projects where id = '${id}' and org_id = '${membership.org_id}' limit 1;`;
  const rows = await runQuery<any>(sql);

  const responseBody: Record<string, unknown> = { project: rows[0] ?? null };
  if (opsSnapshot) {
    responseBody.opsSnapshot = opsSnapshot;
  }

  return new Response(JSON.stringify(responseBody), {
    headers: jsonHeaders
  });
});
