import type { Request, Response } from "express";
import serialize from "node-serialize";

export function deserializeProfile(req: Request, res: Response) {
  const serializedProfile = String(req.body.profile ?? "");

  if (!serializedProfile) {
    res.status(400).json({ error: "missing profile" });
    return;
  }

  const profile = serialize.unserialize(serializedProfile);
  res.json({ profile });
}
