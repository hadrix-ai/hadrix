import { env } from "@/env";

type AuthUser = {
  id: string;
  email: string;
  user_metadata: Record<string, unknown>;
};

type AuthSession = {
  access_token: string;
};

type AuthUserResponse = {
  data: {
    user: AuthUser | null;
  };
};

type AuthSessionResponse = {
  data: {
    session: AuthSession | null;
  };
};

const LOCAL_METADATA_KEY = "steward_user_metadata";
const LOCAL_TOKEN_KEY = "steward_access_token";
const DEFAULT_ACCESS_TOKEN = "steward-local-token";

const defaultUser: AuthUser = {
  id: "steward_user_01",
  email: "steward@brokencrystals.test",
  user_metadata: { role: "member" }
};

function readLocalStorageValue(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.localStorage.getItem(key);
}

function readLocalMetadata(): Record<string, unknown> {
  const raw = readLocalStorageValue(LOCAL_METADATA_KEY);
  if (!raw) {
    return defaultUser.user_metadata;
  }
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Ignore malformed local metadata.
  }
  return defaultUser.user_metadata;
}

function readLocalAccessToken(): string {
  const raw = readLocalStorageValue(LOCAL_TOKEN_KEY);
  if (raw && raw.trim().length > 0) {
    return raw;
  }
  return env.supabaseAnonKey || DEFAULT_ACCESS_TOKEN;
}

export const supabase = {
  auth: {
    async getUser(): Promise<AuthUserResponse> {
      return {
        data: {
          user: {
            ...defaultUser,
            user_metadata: readLocalMetadata()
          }
        }
      };
    },
    async getSession(): Promise<AuthSessionResponse> {
      return {
        data: {
          session: {
            access_token: readLocalAccessToken()
          }
        }
      };
    }
  }
};
