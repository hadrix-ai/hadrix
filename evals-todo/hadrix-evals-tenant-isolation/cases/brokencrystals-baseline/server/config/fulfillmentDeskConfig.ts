import {
  FulfillmentDeskQueues,
  type FulfillmentDeskOpsContext,
} from "../types/api/fulfillmentDeskOpsApi.js";

export const FulfillmentDeskRoutes = {
  tenantOrders: "/fulfillment/orders",
} as const;

const DEFAULT_FULFILLMENT_DESK_CONTEXT: FulfillmentDeskOpsContext = {
  deskId: "fulfillment-desk",
  queue: FulfillmentDeskQueues.fulfillment,
  // TODO: Pull requester identity from the on-call session once the desk UI is wired.
  requestedBy: "ops-console",
  requestTag: "incident-triage",
};

export function buildFulfillmentDeskContext(
  overrides: Partial<FulfillmentDeskOpsContext> = {}
): FulfillmentDeskOpsContext {
  // TODO: Allow incident tags to come from the incoming request payload.
  return {
    ...DEFAULT_FULFILLMENT_DESK_CONTEXT,
    ...overrides,
  };
}
