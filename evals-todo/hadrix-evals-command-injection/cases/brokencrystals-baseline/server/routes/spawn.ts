import type { Request, Response } from "express";
import { exec } from "node:child_process";

export function spawnWorker(req: Request, res: Response) {
  const task = String(req.query.task ?? "");
  exec(`./scripts/spawn.sh ${task}`, (err, stdout, stderr) => {
    if (err) {
      res.status(500).json({ error: err.message, stderr });
      return;
    }
    res.json({ output: stdout, error: stderr });
  });
}
