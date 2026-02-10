import { getAuthContext } from "./_shared/auth.ts";
import { getIntakeDeskContext } from "./_shared/intakeDesk.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";

const jsonHeaders = { "content-type": "application/json" };
const projectColumns = "id, org_id, name";
const maxProjects = 50;
// TODO: add a cursor-based pagination option for large orgs.

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
  const orgId = String((body as any).orgId ?? "");
  const intake = getIntakeDeskContext(req, auth, body);

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

  console.info("intake:list-projects", {
    queue: intake.queue,
    ticketId: intake.ticketId,
    orgId,
    requestedBy: intake.requestedBy
  });

  return new Response(
    JSON.stringify({
      projects: data ?? [],
      error: error?.message ?? null,
      intake: {
        queue: intake.queue,
        ticketId: intake.ticketId,
        requestId: intake.requestId,
        requestedBy: intake.requestedBy
      }
    }),
    {
      headers: jsonHeaders
    }
  );
});
