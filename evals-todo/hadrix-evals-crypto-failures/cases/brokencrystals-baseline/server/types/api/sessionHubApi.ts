export type SupportSessionApiRequest = {
  userId?: string;
  reason?: string;
  actorId?: string;
};

export type ApiTokenIssueApiRequest = {
  userId?: string;
  label?: string;
};

export type SupportSessionApiResponse = {
  ok: boolean;
  sessionToken: string;
  issuedFor: string;
  reason: string;
};

export type ApiTokenIssueApiResponse = {
  ok: boolean;
  token: string;
  label: string;
};
