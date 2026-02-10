import express, { type Express } from "express";
import { SUPPORT_LOOKUP_CONFIG } from "./config/supportLookupConfig.js";
import { SUPPORT_LOOKUP_ROUTES } from "./constants/supportLookupRoutes.js";
import { getUserByEmail } from "./routes/users.js";

export function buildSupportLookupApp(): Express {
  const app = express();

  // TODO: add lightweight request logging once we standardize the ops logger.
  app.locals.supportLookup = SUPPORT_LOOKUP_CONFIG;
  app.get(SUPPORT_LOOKUP_ROUTES.userByEmail, getUserByEmail);

  return app;
}
