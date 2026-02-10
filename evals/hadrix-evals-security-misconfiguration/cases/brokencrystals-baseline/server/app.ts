import express, { type Express } from "express";
import { PARTNER_EMBED_INVENTORY_ROUTE } from "./constants/partnerEmbedRoutes.js";
import {
  PARTNER_WIDGET_INVENTORY,
  PARTNER_WIDGET_UPDATED_AT,
} from "./mock/partnerEmbedInventory.js";
import { corsAllowAll } from "./middleware/cors.js";

export function buildPartnerEmbedApp(): Express {
  const app = express();

  app.use(corsAllowAll);

  app.get(PARTNER_EMBED_INVENTORY_ROUTE, (_req, res) => {
    // TODO: add cache headers once partner inventory sync schedules stabilize.
    // TODO: replace static inventory with per-partner overrides from ops tooling.
    res.json({
      items: PARTNER_WIDGET_INVENTORY,
      updatedAt: PARTNER_WIDGET_UPDATED_AT,
    });
  });

  return app;
}
