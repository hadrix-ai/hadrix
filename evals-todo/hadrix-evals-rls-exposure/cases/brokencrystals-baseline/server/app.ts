import express, { type Express } from "express";

import { accountDirectoryConfig } from "./config/accountDirectoryConfig";
import { accountDirectoryRoster } from "./mock/accountDirectoryRoster";

const accountsDb = {
  async query(_sql: string) {
    return [...accountDirectoryRoster];
  },
};

async function loadAccountDirectory() {
  const rows = await accountsDb.query(accountDirectoryConfig.query);
  return {
    table: accountDirectoryConfig.tableName,
    rows,
  };
}

export function buildAccountDirectoryApp(): Express {
  const app = express();

  app.get(accountDirectoryConfig.route, async (_req, res) => {
    // TODO: add query-based filters (region/status) once we see real traffic.
    const directory = await loadAccountDirectory();
    res.json({
      title: accountDirectoryConfig.title,
      ...directory,
    });
  });

  return app;
}
