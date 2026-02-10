import express, { type Express } from "express";
import { requestPasswordReset } from "./routes/password-reset.js";
import {
  PASSWORD_RESET_ASSIST_QUEUE,
  PASSWORD_RESET_ASSIST_ROUTE,
  PASSWORD_RESET_ASSIST_SOURCE,
} from "./config/passwordResetAssistConfig.js";
import type { PasswordResetDb, PasswordResetRow } from "./types/infra/passwordResetDb.js";

function createInMemoryDb(): PasswordResetDb {
  const rows: PasswordResetRow[] = [];

  return {
    async query(_sql, params) {
      const [userId, token] = params as [string, string];
      rows.push({ user_id: userId, token_value: token });
      return { rows };
    },
  };
}

export function buildPasswordResetAssistApp(): Express {
  const app = express();

  app.use(express.json());
  app.set("db", createInMemoryDb());
  app.set("resetAssistQueue", PASSWORD_RESET_ASSIST_QUEUE);
  app.set("resetAssistSource", PASSWORD_RESET_ASSIST_SOURCE);
  // TODO: Capture per-shift reset volume for the support dashboard.

  app.post(PASSWORD_RESET_ASSIST_ROUTE, requestPasswordReset);

  return app;
}
