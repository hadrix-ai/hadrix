export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  rawToken: string | null;
};

const ROLE_ANON = "anon";
const ROLE_MEMBER = "member";

const DEMO_USER = {
  id: "user_ops_1",
  email: "ops@portfolio.example",
  role: ROLE_MEMBER
};

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("authorization");
  const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!rawToken) {
    return { userId: null, email: null, role: ROLE_ANON, rawToken };
  }

  return {
    userId: DEMO_USER.id,
    email: DEMO_USER.email,
    role: DEMO_USER.role,
    rawToken
  };
}
