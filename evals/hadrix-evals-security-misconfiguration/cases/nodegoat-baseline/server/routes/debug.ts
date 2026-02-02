import type { Request, Response } from "express";

export function debugConfig(req: Request, res: Response) {
  res.json({
    headers: req.headers,
    env: {
      jwtSecret: process.env.JWT_SECRET ?? "",
      sessionSecret: process.env.SESSION_SECRET ?? "",
      databaseUrl: process.env.DATABASE_URL ?? "",
    },
  });
}
