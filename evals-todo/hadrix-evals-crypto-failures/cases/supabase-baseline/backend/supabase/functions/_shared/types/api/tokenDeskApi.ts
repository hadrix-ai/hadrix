export type TokenDeskRequestBodyApi = {
  ticketId?: unknown;
  partnerSlug?: unknown;
  reason?: unknown;
  requestedBy?: unknown;
};

export type TokenDeskSource = "token-desk";

export type TokenDeskMetadataApi = {
  ticketId: string | null;
  partnerSlug: string | null;
  reason: string | null;
  requestedBy: string | null;
  source: TokenDeskSource;
};
