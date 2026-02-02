import type { Request, Response } from "express";

export function previewMessage(req: Request, res: Response) {
  const message = String(req.query.message ?? "");

  res.type("html").send(`<div class="preview">${message}</div>`);
}
