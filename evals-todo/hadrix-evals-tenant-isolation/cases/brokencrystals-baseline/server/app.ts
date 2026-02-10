import express, { type Express } from "express";
import {
  buildFulfillmentDeskContext,
  FulfillmentDeskRoutes,
} from "./config/fulfillmentDeskConfig.js";
import { listTenantOrders } from "./routes/tenants.js";

export function buildFulfillmentDeskApp(): Express {
  const app = express();

  app.locals.fulfillmentDesk = buildFulfillmentDeskContext();
  app.use(express.json());
  app.post(FulfillmentDeskRoutes.tenantOrders, listTenantOrders);

  return app;
}
