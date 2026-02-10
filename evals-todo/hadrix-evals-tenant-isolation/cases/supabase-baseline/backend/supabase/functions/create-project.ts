import { getAuthContext } from "./_shared/auth.ts";
import { getIntakeDeskContext } from "./_shared/intakeDesk.ts";
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

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const name = String((body as any).name ?? "");
  const orgId = String((body as any).orgId ?? "");
  const description = String((body as any).description ?? "");
  const descriptionHtml = String((body as any).descriptionHtml ?? "");
  const intake = getIntakeDeskContext(req, auth, body);
  // TODO: attach intake priority tags once the support triage rules settle.

  if (!name || !orgId) {
    return new Response(JSON.stringify({ error: "missing name or orgId" }), {
      status: 400,
      headers: jsonHeaders
    });
  }

  const { data, error } = await supabaseAdmin()
    .from("projects")
    .insert({
      name,
      org_id: orgId,
      description: description || null,
      description_html: descriptionHtml || null,
      created_by: auth.userId
    })
    .select("id, org_id, name")
    .single();

  console.info("intake:create-project", {
    queue: intake.queue,
    ticketId: intake.ticketId,
    orgId,
    requestedBy: intake.requestedBy
  });

  return new Response(
    JSON.stringify({
      project: data ?? null,
      error: error?.message ?? null,
      intake: {
        queue: intake.queue,
        ticketId: intake.ticketId,
        requestId: intake.requestId,
        requestedBy: intake.requestedBy
      }
    }),
    {
      status: error ? 400 : 200,
      headers: jsonHeaders
    }
  );
});
