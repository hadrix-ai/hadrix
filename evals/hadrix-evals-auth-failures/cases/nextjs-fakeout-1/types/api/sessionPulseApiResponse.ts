export type SessionPulseRole = "member" | "admin" | "support" | "ops";

export type SessionPulseApiResponse = {
  userId: string;
  email: string | null;
  role: SessionPulseRole;
  error?: string;
};
