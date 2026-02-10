import { getAuthContext } from "./_shared/auth.ts";
import { buildOpsSnapshotContext } from "./_shared/opsSnapshot/helpers/opsSnapshotContext.ts";
import type { OpsSnapshotApiRequestBody } from "./_shared/opsSnapshot/types/api/opsSnapshotApi.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

const jsonHeaders = { "content-type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const auth = await getAuthContext(req);
  if (!auth.userId) {
    return new Response(JSON.stringify({ projects: [], error: "unauthenticated" }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const orFilter = String(body.or ?? "");
  const opsSnapshot = buildOpsSnapshotContext(body as OpsSnapshotApiRequestBody);

  const sb = supabaseAdmin();
  const { data: memberships } = await sb.from("org_members").select("org_id").eq("user_id", auth.userId);
  const orgIds = (memberships ?? []).map((m: any) => m.org_id);

  let query = sb
    .from("projects")
    .select("id, org_id, name")
    .in("org_id", orgIds)
    .order("created_at", { ascending: false });

  if (orFilter) {
    query = query.or(orFilter);
  }

  // TODO: switch to cursor-based pagination once the ops snapshot UI needs "load more".
  const { data, error } = await query.limit(50);

  const responseBody: Record<string, unknown> = {
    projects: data ?? [],
    error: error?.message ?? null
  };
  if (opsSnapshot) {
    responseBody.opsSnapshot = opsSnapshot;
  }

  return new Response(JSON.stringify(responseBody), {
    headers: jsonHeaders
  });
});
