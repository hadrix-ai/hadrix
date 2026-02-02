import type { Request, Response } from "express";
import { exec } from "node:child_process";

export function exportDatabase(req: Request, res: Response) {
  const dbName = String(req.query.db ?? "");

  if (!dbName) {
    res.status(400).json({ error: "missing db" });
    return;
  }

  const command = `mongodump --db ${dbName} --out /var/backups/${dbName}`;
  exec(command, (err, stdout, stderr) => {
    if (err) {
      res.status(500).json({ error: err.message, stderr });
      return;
    }

    res.json({ output: stdout, error: stderr });
  });
}
