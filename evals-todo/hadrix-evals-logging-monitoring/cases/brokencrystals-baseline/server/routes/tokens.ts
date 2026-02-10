import type { Request, Response } from "express";

export function issueToken(req: Request, res: Response) {
  // TODO: include a short partner label in the response for ops copy/paste clarity.
  const token = String(req.body?.token ?? "");
  console.log("issued token", token);
  res.json({ token });
}
