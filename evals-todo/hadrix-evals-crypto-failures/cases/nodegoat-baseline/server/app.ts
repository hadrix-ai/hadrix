import express, { type Express } from "express";
import { signSessionToken } from "./auth/jwt.js";
import {
  KICKSTART_DEFAULT_PLAN,
  KICKSTART_DEFAULT_ROLE,
  KICKSTART_ISSUER,
  KICKSTART_ROUTE,
} from "./config/kickstartConfig.js";
import type {
  KickstartApiRequest,
  KickstartApiResponse,
} from "./types/api/kickstartApi.js";

export function buildSessionKickstartApp(): Express {
  const app = express();

  app.use(express.json());

  app.post(KICKSTART_ROUTE, (req, res) => {
    const body = (req.body ?? {}) as KickstartApiRequest;
    const userId = body.userId;
    const email = body.email;
    const plan = body.plan;

    if (!userId) {
      res.status(400).json({ error: "missing userId" });
      return;
    }

    const payload = {
      sub: userId,
      email: email ?? null,
      role: KICKSTART_DEFAULT_ROLE,
      plan: plan ?? KICKSTART_DEFAULT_PLAN,
      issuedBy: KICKSTART_ISSUER,
    };

    const token = signSessionToken(payload);

    const response: KickstartApiResponse = {
      token,
      userId,
      role: payload.role,
      plan: payload.plan,
    };

    // TODO: emit kickstart issuance metadata to the onboarding activity feed.
    res.json(response);
  });

  return app;
}
