import type { Request, Response } from "express";
import { exec } from "node:child_process";

export function runDiagnostics(req: Request, res: Response) {
  const host = String(req.query.host ?? "");

  if (!host) {
    res.status(400).json({ error: "missing host" });
    return;
  }

  exec(`ping -c 1 ${host}`, (err, stdout, stderr) => {
    if (err) {
      res.status(500).json({ error: err.message, stderr });
      return;
    }

    res.json({ output: stdout, error: stderr });
  });
}
