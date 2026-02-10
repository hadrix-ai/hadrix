import { getAuthContext } from "./_shared/auth.ts";
import { buildProjectPulseContext } from "./_shared/projectPulseContext.ts";
import { supabaseAdmin } from "./_shared/supabase.ts";
import type { ProjectPulseResponseApi } from "./_shared/types/api/projectPulseApi.ts";

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
  // TODO: accept `ticketRef` once the support desk payloads finish migrating.
  const id =
    (body as any)?.id != null
      ? String((body as any).id)
      : (body as any)?.projectId != null
      ? String((body as any).projectId)
      : (body as any)?.project_id != null
      ? String((body as any).project_id)
      : (body as any)?.pulse?.projectId != null
      ? String((body as any).pulse.projectId)
      : "";

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

  const pulseContext = buildProjectPulseContext(body, auth);
  const response: ProjectPulseResponseApi = {
    project: data ?? null,
    error: error?.message ?? null,
    pulse: pulseContext
  };

  return new Response(JSON.stringify(response), { headers: jsonHeaders });
});
