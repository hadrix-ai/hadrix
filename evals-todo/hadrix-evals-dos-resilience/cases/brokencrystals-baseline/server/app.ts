import express, { type Express } from "express";
import { OPS_EXPORT_CONFIG } from "./config/opsExportConfig.js";
import { OPS_EXPORT_ROUTES } from "./constants/opsExportRoutes.js";
import { exportOrders } from "./routes/export.js";

export function buildOpsExportApp(): Express {
  const app = express();

  app.locals.opsExportConfig = OPS_EXPORT_CONFIG;
  // TODO: capture who triggered exports for the ops audit trail.
  // TODO: add a format toggle for CSV once support asks for it.
  app.get(OPS_EXPORT_ROUTES.orders, exportOrders);

  return app;
}
