export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  rawToken: string | null;
};

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("authorization");
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;
  const headerUserId = req.headers.get("x-user-id");
  const headerEmail = req.headers.get("x-user-email");
  const headerRole = req.headers.get("x-user-role");

  const userId = headerUserId ?? rawToken ?? null;
  if (!userId) {
    return { userId: null, email: null, role: "anon", rawToken };
  }

  const role = headerRole ?? "member";
  return { userId, email: headerEmail ?? null, role, rawToken };
}
