type LocalUser = {
  id: string;
  email: string;
};

type LocalSession = {
  access_token: string;
  user: LocalUser;
};

type SessionResponse = {
  data: { session: LocalSession | null };
};

type SignInResponse = {
  data: { session: LocalSession | null };
  error: { message: string } | null;
};

const DEFAULT_SESSION: LocalSession = {
  access_token: "signal-desk-session",
  user: { id: "signal-desk-user", email: "oncall@signaldash.test" }
};

let currentSession: LocalSession | null = DEFAULT_SESSION;

export const supabase = {
  auth: {
    async getSession(): Promise<SessionResponse> {
      return { data: { session: currentSession } };
    },
    async signInWithPassword({
      email,
      password: _password
    }: {
      email: string;
      password: string;
    }): Promise<SignInResponse> {
      currentSession = {
        access_token: DEFAULT_SESSION.access_token,
        user: { id: DEFAULT_SESSION.user.id, email: email || DEFAULT_SESSION.user.email }
      };
      return { data: { session: currentSession }, error: null };
    }
  }
};
