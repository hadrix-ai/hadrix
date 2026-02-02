import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

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

  const body = await req.json().catch(() => ({}));
  const orgId = String((body as any).orgId ?? "");

  if (!orgId) {
    return new Response(JSON.stringify({ projects: [], error: "missing orgId" }), {
      status: 400,
      headers: jsonHeaders
    });
  }

  const { data, error } = await supabaseAdmin()
    .from("projects")
    .select(projectColumns)
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(maxProjects);

  return new Response(JSON.stringify({ projects: data ?? [], error: error?.message ?? null }), {
    headers: jsonHeaders
  });
});
