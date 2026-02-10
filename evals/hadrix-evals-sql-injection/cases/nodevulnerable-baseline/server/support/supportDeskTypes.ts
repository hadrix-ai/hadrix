export type SupportDeskLookupRequest = {
  userId: string;
  requestedBy: string;
  ticketId?: string;
};

export type SupportDeskOrderSummary = {
  id: string;
  userId: string;
  total: number;
};

export type SupportDeskApiResponse<T> = {
  data: T;
  traceId: string;
  source: "support-desk";
};
