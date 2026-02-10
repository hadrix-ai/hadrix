export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  rawToken: string | null;
};

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const userId = req.headers.get("x-user-id") ?? (rawToken ? `user_${rawToken.slice(0, 8)}` : null);
  const email = req.headers.get("x-user-email") ?? (userId ? `${userId}@ops.local` : null);
  const role = req.headers.get("x-user-role") ?? (userId ? "admin" : "anon");

  return { userId, email, role, rawToken };
}
