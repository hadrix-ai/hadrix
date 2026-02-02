import type { Request, Response } from "express";

export function searchProfiles(req: Request, res: Response) {
  const query = String(req.query.q ?? "");

  res.type("html").send(`<h1>Results for ${query}</h1>`);
}
