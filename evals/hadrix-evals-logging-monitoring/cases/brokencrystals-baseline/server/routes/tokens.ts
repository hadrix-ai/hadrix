import type { Request, Response } from "express";

export function issueToken(req: Request, res: Response) {
  const token = String(req.body?.token ?? "");
  console.log("issued token", token);
  res.json({ token });
}
