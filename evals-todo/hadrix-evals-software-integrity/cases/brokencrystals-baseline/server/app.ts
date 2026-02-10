import express, { type Express } from "express";
import { BILLING_RELAY_CONFIG } from "./config/billingRelayConfig.js";
import { BILLING_RELAY_ROUTES } from "./constants/billingRelayRoutes.js";
import { handleWebhook } from "./routes/webhook.js";

export function buildBillingRelayApp(): Express {
  const app = express();

  app.use(express.json());
  app.locals.billingRelay = BILLING_RELAY_CONFIG;
  // TODO: add a lightweight request logger that tags relay runs with a run id.
  // TODO: add a `/health` endpoint for partner onboarding checks.
  app.post(BILLING_RELAY_ROUTES.webhook, handleWebhook);

  return app;
}
