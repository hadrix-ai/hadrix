import express, { type Express } from "express";
import { PARTNER_TOKEN_CONCIERGE_ROUTES } from "./constants/partnerTokenRoutes.js";
import { partnerConciergeRoster } from "./mock/partnerConciergeRoster.js";
import { issueToken } from "./routes/tokens.js";

export function buildPartnerTokenConciergeApp(): Express {
  const app = express();

  app.use(express.json());
  // TODO: move roster seeding into a tiny ops bootstrap so tests can override it.
  app.locals.partnerConciergeRoster = partnerConciergeRoster;
  app.post(PARTNER_TOKEN_CONCIERGE_ROUTES.issue, issueToken);

  return app;
}
