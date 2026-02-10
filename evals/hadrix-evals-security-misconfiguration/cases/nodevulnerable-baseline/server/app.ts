import express, { type Express, type Request, type Response } from "express";
import { PARTNER_WIDGET_STATUS_ROUTE } from "./constants/partnerWidgetRoutes.js";
import { corsAllowAll } from "./middleware/cors.js";
import type { PartnerWidgetStatusPayload } from "./types/api/partnerWidgetStatusApi.js";

const PARTNER_WIDGET_STATUS_PAYLOAD: PartnerWidgetStatusPayload = {
  service: "partner-status-widget",
  status: "degraded",
  summary: "Embed status feed for partner portals.",
  lastIncidentId: "inc-1142",
};

export function buildPartnerWidgetApp(): Express {
  const app = express();

  app.use(corsAllowAll);
  app.get(PARTNER_WIDGET_STATUS_ROUTE, (req: Request, res: Response) => {
    // TODO: allow per-partner overrides once we have a real tenant store.
    const requestId = req.header("x-widget-request-id") ?? "widget-demo";

    res.json({
      ...PARTNER_WIDGET_STATUS_PAYLOAD,
      requestId,
    });
  });

  return app;
}
