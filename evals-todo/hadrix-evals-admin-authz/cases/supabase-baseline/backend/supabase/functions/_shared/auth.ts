import { createClient } from "@supabase/supabase-js";

export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  rawToken: string | null;
};

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabase = createClient(url, anonKey, {
    global: { headers: { authorization: req.headers.get("authorization") ?? "" } }
  });

  const authHeader = req.headers.get("authorization");
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return { userId: null, email: null, role: "anon", rawToken };
  }

  const role = (data.user.user_metadata as any)?.role ?? "member";
  return { userId: data.user.id, email: data.user.email ?? null, role, rawToken };
}
