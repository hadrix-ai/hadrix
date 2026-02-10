export type PartnerWidgetStatusState = "operational" | "degraded" | "partial_outage";

export type PartnerWidgetStatusPayload = {
  service: string;
  status: PartnerWidgetStatusState;
  summary: string;
  lastIncidentId: string;
};

export type PartnerWidgetStatusApiResponse = PartnerWidgetStatusPayload & {
  requestId: string;
};
