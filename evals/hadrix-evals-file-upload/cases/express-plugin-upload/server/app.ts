import express, { type Express } from "express";
import { PLUGIN_WORKSHOP_ROSTER } from "./constants/pluginWorkshopRoster.js";
import { PLUGIN_WORKSHOP_ROUTES } from "./constants/pluginWorkshopRoutes.js";
import { uploadPlugin } from "./routes/plugins.js";
import type { PluginWorkshopRosterApiResponse } from "./types/api/pluginWorkshopRosterApiResponse.js";

export function buildPluginWorkshopApp(): Express {
  const app = express();

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get(PLUGIN_WORKSHOP_ROUTES.list, (_req, res) => {
    const response: PluginWorkshopRosterApiResponse = {
      plugins: PLUGIN_WORKSHOP_ROSTER,
      count: PLUGIN_WORKSHOP_ROSTER.length,
    };

    // TODO: Add paging + lightweight filters once the roster grows beyond a few dozen plugins.
    res.json(response);
  });

  // TODO: Capture uploader display name for the ops audit feed.
  app.post(PLUGIN_WORKSHOP_ROUTES.upload, uploadPlugin);

  return app;
}
