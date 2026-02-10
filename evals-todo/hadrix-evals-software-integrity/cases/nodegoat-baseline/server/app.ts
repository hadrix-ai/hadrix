import express, { type Express } from "express";
import { profileRestoreAppConfig } from "./config/profileRestoreAppConfig.js";
import { PROFILE_RESTORE_ROUTES } from "./constants/profileRestoreRoutes.js";
import { deserializeProfile } from "./routes/deserialize.js";

export function buildProfileSnapshotRestoreApp(): Express {
  const app = express();

  app.use(express.json());
  app.locals.profileRestoreConfig = profileRestoreAppConfig;
  app.post(PROFILE_RESTORE_ROUTES.snapshotRestore, deserializeProfile);

  return app;
}
