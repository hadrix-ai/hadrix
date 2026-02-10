export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  rawToken: string | null;
};

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (rawToken) {
    return { userId: "unknown-user", email: null, role: "member", rawToken };
  }

  return { userId: null, email: null, role: "anon", rawToken };
}
