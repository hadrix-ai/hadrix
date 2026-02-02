import type { Request, Response } from "express";

export function login(req: Request, res: Response) {
  const username = String(req.body?.username ?? "");
  const password = String(req.body?.password ?? "");

  if (!username || !password) {
    res.status(400).json({ error: "missing credentials" });
    return;
  }

  console.log("login attempt", { username, password });
  res.json({ ok: true });
}
