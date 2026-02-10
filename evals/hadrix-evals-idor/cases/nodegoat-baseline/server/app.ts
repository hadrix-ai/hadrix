import express, { type Express } from "express";
import { SUPPORT_CHARGE_LOOKUP_ROUTE } from "./constants/supportChargeLookupRoutes.js";
import { getTransactionById } from "./routes/transactions.js";

export function buildSupportChargeLookupApp(): Express {
  const app = express();

  app.get(SUPPORT_CHARGE_LOOKUP_ROUTE, getTransactionById);

  return app;
}
