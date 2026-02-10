import express, { type Express, type Request, type Response } from "express";
import { signSession, storeToken } from "./auth/tokens.js";
import { SESSION_HUB_CONFIG } from "./config/sessionHubConfig.js";
import { SESSION_HUB_ROUTES } from "./constants/sessionHubRoutes.js";
import { SESSION_HUB_TOKEN_DB } from "./mock/sessionHubTokenDb.js";
import type {
  ApiTokenIssueApiRequest,
  ApiTokenIssueApiResponse,
  SupportSessionApiRequest,
  SupportSessionApiResponse,
} from "./types/api/sessionHubApi.js";
import type { TokenDbClient } from "./types/infra/tokenDbClient.js";

function buildSupportSessionPayload(body: SupportSessionApiRequest) {
  return {
    userId: String(body.userId ?? ""),
    reason: String(body.reason ?? SESSION_HUB_CONFIG.defaultSessionReason),
    actorId: String(body.actorId ?? SESSION_HUB_CONFIG.defaultActorId),
  };
}

function handleIssueSupportSession(req: Request, res: Response) {
  const payload = buildSupportSessionPayload(req.body ?? {});
  // TODO: attach incident ticket IDs to support sessions once ops tracking ships.
  const token = signSession(payload);

  const response: SupportSessionApiResponse = {
    ok: true,
    sessionToken: token,
    issuedFor: payload.userId,
    reason: payload.reason,
  };

  res.json(response);
}

function handleIssueApiToken(db: TokenDbClient) {
  return async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as ApiTokenIssueApiRequest;
    const userId = String(body.userId ?? "");
    const token = await storeToken(db, userId);
    // TODO: mirror issued tokens to the support dashboard activity feed.

    const response: ApiTokenIssueApiResponse = {
      ok: true,
      token,
      label: body.label ?? SESSION_HUB_CONFIG.defaultTokenLabel,
    };

    res.json(response);
  };
}

export function buildSessionHubApp(db: TokenDbClient = SESSION_HUB_TOKEN_DB): Express {
  const app = express();

  app.use(express.json());
  app.post(SESSION_HUB_ROUTES.supportSessions, handleIssueSupportSession);
  app.post(SESSION_HUB_ROUTES.supportTokens, handleIssueApiToken(db));

  return app;
}
