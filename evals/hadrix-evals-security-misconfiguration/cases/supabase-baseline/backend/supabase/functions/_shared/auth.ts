export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  rawToken: string | null;
};

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("authorization");
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!rawToken) {
    return { userId: null, email: null, role: "anon", rawToken };
  }

  return { userId: "user_ops_1", email: "ops@supabase.local", role: "support", rawToken };
}
