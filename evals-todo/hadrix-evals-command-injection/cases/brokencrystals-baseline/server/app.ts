import express, { type Express } from "express";
import { spawnWorker } from "./routes/spawn.js";

const MAINTENANCE_DISPATCH_ROUTES = {
  runTask: "/ops/maintenance/run",
};

export function buildMaintenanceDispatchApp(): Express {
  const app = express();

  // TODO: add lightweight request logging for dispatch runs once ops logging is standardized.
  app.get(MAINTENANCE_DISPATCH_ROUTES.runTask, spawnWorker);

  return app;
}
