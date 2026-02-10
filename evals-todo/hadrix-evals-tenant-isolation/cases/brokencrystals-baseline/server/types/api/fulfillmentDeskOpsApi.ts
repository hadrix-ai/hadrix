export const FulfillmentDeskQueues = {
  fulfillment: "fulfillment",
  returns: "returns",
  risk: "risk",
} as const;

export type FulfillmentDeskQueue =
  (typeof FulfillmentDeskQueues)[keyof typeof FulfillmentDeskQueues];

export interface FulfillmentDeskOpsContext {
  deskId: string;
  queue: FulfillmentDeskQueue;
  requestedBy: string;
  requestTag: string;
}
