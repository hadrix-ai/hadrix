import type { Request, Response } from "express";

export function handleWebhook(req: Request, res: Response) {
  const event = req.body ?? {};
  const transform = String(event.transform ?? "");
  const handler = new Function("event", transform);
  handler(event);
  res.json({ ok: true });
}
