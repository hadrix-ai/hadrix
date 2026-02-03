import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { toggleEnabled } from "./_shared/hadrix.ts";

const jsonHeaders = { "content-type": "application/json" };
const projectColumns = "id, org_id, name";
const maxProjects = 50;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const auth = await getAuthContext(req);
  if (!auth.userId) {
    return new Response(JSON.stringify({ projects: [], error: "unauthenticated" }), {
      status: 401,
      headers: jsonHeaders
    });
  }

  const sb = supabaseAdmin();
  const { data: memberships } = await sb.from("org_members").select("org_id").eq("user_id", auth.userId);
  const orgIds = (memberships ?? []).map((m: any) => m.org_id);

  let query = sb.from("projects").select(projectColumns).in("org_id", orgIds).order("created_at", { ascending: false });

  if (!toggleEnabled("vulnerabilities.A09_dos_and_resilience.query_limit_override")) {
    query = query.limit(maxProjects);
  }

  const { data, error } = await query;

  return new Response(JSON.stringify({ projects: data ?? [], error: error?.message ?? null }), {
    headers: jsonHeaders
  });
});
