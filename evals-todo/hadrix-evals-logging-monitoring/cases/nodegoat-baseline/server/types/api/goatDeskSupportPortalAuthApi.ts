export type GoatDeskSupportQueue = "general" | "security" | "billing";

export type GoatDeskSupportPortalLoginRequest = {
  username: string;
  password: string;
  rememberMe?: boolean;
  incidentTag?: string;
};

export type GoatDeskSupportPortalLoginResponse = {
  ok: boolean;
  agentId?: string;
  displayName?: string;
  queue?: GoatDeskSupportQueue;
  error?: string;
};
