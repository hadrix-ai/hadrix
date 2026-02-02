import { getAuthContext } from "./_shared/auth.ts";
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

  const body = await req.json().catch(() => ({}));
  const unsafeOrFilter = String((body as any).or ?? "");

  const sb = supabaseAdmin();
  const { data: memberships } = await sb.from("org_members").select("org_id").eq("user_id", auth.userId);
  const orgIds = (memberships ?? []).map((m: any) => m.org_id);

  let query = sb
    .from("projects")
    .select("id, org_id, name")
    .in("org_id", orgIds)
    .order("created_at", { ascending: false });

  if (unsafeOrFilter) {
    query = query.or(unsafeOrFilter);
  }

  const { data, error } = await query.limit(50);

  return new Response(JSON.stringify({ projects: data ?? [], error: error?.message ?? null }), {
    headers: jsonHeaders
  });
});
