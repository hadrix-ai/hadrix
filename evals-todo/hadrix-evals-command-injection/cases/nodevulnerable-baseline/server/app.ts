import express, { type Express } from "express";
import { SUPPORT_DIAGNOSTICS_CONFIG } from "./config/supportDiagnosticsConfig.js";
import { SUPPORT_DIAGNOSTICS_ROUTES } from "./constants/supportDiagnosticsRoutes.js";
import { runDiagnostics } from "./routes/diagnostics.js";

export function buildSupportDiagnosticsApp(): Express {
  const app = express();

  app.locals.supportDiagnosticsConfig = SUPPORT_DIAGNOSTICS_CONFIG;
  // TODO: capture a lightweight in-memory audit trail for ping checks.
  app.get(SUPPORT_DIAGNOSTICS_ROUTES.ping, runDiagnostics);

  return app;
}
