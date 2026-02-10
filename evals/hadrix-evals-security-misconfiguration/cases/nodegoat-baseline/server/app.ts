import express, { type Express } from "express";
import { OPS_DIAGNOSTICS_ROUTE } from "./constants/opsDiagnosticsRoutes.js";
import { OPS_DIAGNOSTICS_PANELS } from "./mock/opsDiagnosticsPanels.js";
import { debugConfig } from "./routes/debug.js";

export function buildOpsDiagnosticsApp(): Express {
  const app = express();

  // TODO: Load panel definitions from a local config file once ops adds more views.
  app.locals.opsDiagnosticsPanels = OPS_DIAGNOSTICS_PANELS;
  app.get(OPS_DIAGNOSTICS_ROUTE, debugConfig);

  return app;
}
