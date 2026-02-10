import express, { type Express } from "express";
import { listOrders } from "./routes/orders.js";

const SUPPORT_DESK_ROUTES = {
  orders: "/support/orders",
};

export function buildSupportDeskApp(): Express {
  const app = express();

  // TODO: wire Support Desk request metrics into the ops dashboard once we settle on schema.
  app.get(SUPPORT_DESK_ROUTES.orders, listOrders);

  return app;
}
