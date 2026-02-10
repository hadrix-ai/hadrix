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

  const demoUsers = new Map([
    ["desk-admin-token", { id: "user-desk-admin", email: "ops@release.local", role: "ops" }],
    ["desk-member-token", { id: "user-desk-07", email: "reviewer@release.local", role: "member" }]
  ]);

  const known = demoUsers.get(rawToken);
  if (known) {
    return { userId: known.id, email: known.email, role: known.role, rawToken };
  }

  return { userId: rawToken, email: null, role: "member", rawToken };
}
