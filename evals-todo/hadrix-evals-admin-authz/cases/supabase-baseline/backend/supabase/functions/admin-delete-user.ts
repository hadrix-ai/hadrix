import { getAuthContext } from "./_shared/auth.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

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
  const userId = String((body as any).userId ?? "");

  if (!userId) {
    return new Response(JSON.stringify({ error: "missing userId" }), {
      status: 400,
      headers: jsonHeaders
    });
  }

  const sb = supabaseAdmin();
  const { error } = await sb.auth.admin.deleteUser(userId);

  await sb.from("audit_logs").insert({
    actor_user_id: auth.userId,
    action: "admin_delete_user",
    target: userId,
    metadata: { via: "edge-function" }
  });

  return new Response(JSON.stringify({ ok: !error, error: error?.message ?? null }), {
    status: error ? 400 : 200,
    headers: jsonHeaders
  });
});
