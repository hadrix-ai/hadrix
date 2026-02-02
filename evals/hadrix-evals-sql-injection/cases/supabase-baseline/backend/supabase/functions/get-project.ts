import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import { unsafeSql } from "./_shared/unsafeSql.ts";

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

  const body = await req.json().catch(() => ({}));
  const id = String((body as any).id ?? "");

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

  const sql =
    `select id, org_id, name, description, description_html from public.projects where id = '${id}' and org_id = '${membership.org_id}' limit 1;`;
  const rows = await unsafeSql<any>(sql);

  return new Response(JSON.stringify({ project: rows[0] ?? null }), {
    headers: jsonHeaders
  });
});
