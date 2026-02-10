import express, { type Express } from "express";
import { OPS_CONSOLE_CONFIG } from "./config/opsConsoleConfig.js";
import { OPS_CONSOLE_ROUTES } from "./constants/opsConsoleRoutes.js";
import { OPS_ROSTER } from "./mock/opsRoster.js";
import { grantAdmin } from "./routes/adminUsers.js";

export function buildOpsConsoleApp(): Express {
  const app = express();

  app.locals.opsConsole = OPS_CONSOLE_CONFIG;
  // TODO: Replace roster with a persisted source once ops sync lands.
  app.locals.opsRoster = OPS_ROSTER;

  app.use(express.json());
  app.patch(OPS_CONSOLE_ROUTES.adminUserRole, grantAdmin);

  return app;
}
