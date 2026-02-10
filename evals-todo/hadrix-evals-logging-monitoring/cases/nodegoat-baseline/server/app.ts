import express, { type Express } from "express";
import { login } from "./routes/login.js";

const GOATDESK_SUPPORT_PORTAL_LOGIN_ROUTE = "/support/login";

export function buildGoatDeskSupportPortalApp(): Express {
  const app = express();

  app.use(express.json());
  // TODO: add a lightweight healthcheck route for internal uptime pings.
  // TODO: capture basic request timing metrics for the support login path.
  app.post(GOATDESK_SUPPORT_PORTAL_LOGIN_ROUTE, login);

  return app;
}
