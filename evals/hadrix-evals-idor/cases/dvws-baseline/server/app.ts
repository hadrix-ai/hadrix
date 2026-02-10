import express, { type Express } from "express";
import { BILLING_DESK_CONFIG } from "./config/billingDeskConfig.js";
import { BILLING_DESK_ROUTES } from "./constants/billingDeskRoutes.js";
import { getAccountById } from "./routes/accounts.js";

export function buildBillingDeskApp(): Express {
  const app = express();

  app.locals.billingDeskConfig = BILLING_DESK_CONFIG;
  app.locals.billingDeskRoutes = BILLING_DESK_ROUTES;
  app.locals.billingDeskQuickLookupEnabled = !BILLING_DESK_CONFIG.enableQuickLookup;

  app.get(BILLING_DESK_ROUTES.accountSnapshot, getAccountById);

  return app;
}
