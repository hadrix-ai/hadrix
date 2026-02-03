import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

const jsonHeaders = { "content-type": "application/json" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const auth = await getAuthContext(req);
  if (!auth.userId) {
    return new Response(JSON.stringify({ error: "request rejected" }), {
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
  const { data, error } = await sb
    .from("projects")
    .select("id, org_id, name, description, description_html")
    .eq("id", id)
    .maybeSingle();

  return new Response(JSON.stringify({ project: data ?? null, error: error?.message ?? null }), {
    headers: jsonHeaders
  });
});
