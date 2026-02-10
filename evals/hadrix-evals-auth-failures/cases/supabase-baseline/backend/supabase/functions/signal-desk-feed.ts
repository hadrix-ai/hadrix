import { getAuthContext } from "./_shared/auth.ts";

const jsonHeaders = { "content-type": "application/json" };

type SignalDeskUpdateApi = {
  id: string;
  title: string;
  detail: string;
  created_at: string;
};

const signalDeskUpdates: SignalDeskUpdateApi[] = [
  {
    id: "sig-101",
    title: "Build queue catching up",
    detail: "North region runners are back to steady state after the patch deploy.",
    created_at: "2026-02-01T08:14:00Z"
  },
  {
    id: "sig-102",
    title: "Webhook retries elevated",
    detail: "Billing webhooks are retrying more than usual; tracking with vendor support.",
    created_at: "2026-02-01T09:03:00Z"
  },
  {
    id: "sig-103",
    title: "Incident drill scheduled",
    detail: "Ops will run the weekly fire drill at 16:00 UTC. Heads-up for on-call.",
    created_at: "2026-02-01T10:22:00Z"
  }
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok");

  const auth = await getAuthContext(req);
  const body = await req.json().catch(() => ({}));
  const channel = String((body as { channel?: string }).channel ?? "ops");

  const payload = {
    channel,
    viewer: {
      id: auth.userId,
      role: auth.role
    },
    updates: signalDeskUpdates
  };

  return new Response(JSON.stringify(payload), { headers: jsonHeaders });
});
