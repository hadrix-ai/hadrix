export type AuthContext = {
  userId: string | null;
  email: string | null;
  role: string;
  rawToken: string | null;
};

type SeedUser = {
  token: string;
  id: string;
  email: string;
  role: string;
};

const SEED_USERS: SeedUser[] = [
  {
    token: "token-intake-support",
    id: "user-2001",
    email: "support@intake.local",
    role: "support"
  },
  {
    token: "token-intake-member",
    id: "user-2002",
    email: "member@intake.local",
    role: "member"
  }
];

function resolveSeedUser(rawToken: string): SeedUser | null {
  const match = SEED_USERS.find((user) => user.token === rawToken);
  return match ?? null;
}

export async function getAuthContext(req: Request): Promise<AuthContext> {
  const authHeader = req.headers.get("authorization") ?? "";
  const rawToken = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : null;

  if (!rawToken) {
    return { userId: null, email: null, role: "anon", rawToken };
  }

  const seedUser = resolveSeedUser(rawToken);
  if (seedUser) {
    return {
      userId: seedUser.id,
      email: seedUser.email,
      role: seedUser.role,
      rawToken
    };
  }

  return {
    userId: rawToken,
    email: `${rawToken}@intake.local`,
    role: "member",
    rawToken
  };
}
