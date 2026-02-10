import express, { type Express } from "express";
import { BACKUP_SNAPSHOT_CONFIG } from "./config/backupSnapshotConfig.js";
import { BACKUP_SNAPSHOT_ROUTES } from "./constants/backupSnapshotRoutes.js";
import { exportDatabase } from "./routes/backup.js";

export function buildBackupSnapshotApp(): Express {
  const app = express();

  // TODO: add a lightweight request log for snapshot triggers.
  // TODO: capture snapshot metadata in a simple in-memory audit list.
  app.locals.backupSnapshotConfig = BACKUP_SNAPSHOT_CONFIG;

  app.get(BACKUP_SNAPSHOT_ROUTES.snapshot, exportDatabase);

  return app;
}
