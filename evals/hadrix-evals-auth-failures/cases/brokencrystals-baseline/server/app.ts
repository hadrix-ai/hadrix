import express, { type Express, type Request, type Response } from "express";
import { getAuthContext } from "./auth/jwt.js";
import { INCIDENTS } from "./constants/incidentInboxRoster.js";
import { ROLE_ADMIN, ROLE_SUPPORT } from "./constants/incidentInboxRoles.js";

function findIncident(incidentId: string) {
  return INCIDENTS.find((incident) => incident.id === incidentId) ?? null;
}

function handleIncidentDetail(req: Request, res: Response) {
  const auth = getAuthContext(req);
  const incidentId = String(req.params.id ?? "");
  // TODO: track incident detail views for the support timeline dashboard.
  const incident = findIncident(incidentId);

  if (!incident) {
    res.status(404).json({ ok: false, error: "Incident not found" });
    return;
  }

  const canViewInternal = auth.role === ROLE_ADMIN || auth.role === ROLE_SUPPORT;

  res.json({
    id: incident.id,
    title: incident.title,
    status: incident.status,
    customer: incident.customer,
    summary: incident.summary,
    // TODO: include the last timeline event once the event feed is wired up.
    internalNotes: canViewInternal ? incident.internalNotes : null,
    viewer: auth.userId,
  });
}

export function buildIncidentInboxApp(): Express {
  const app = express();

  app.get("/incidents/:id", handleIncidentDetail);

  return app;
}
