import fs from "fs/promises";
import path from "path";
import type { Request, Response } from "express";

const pluginsDir = path.join(process.cwd(), "data", "plugins");

type UploadedPlugin = {
  originalname?: string;
  buffer?: Buffer;
};

export async function uploadPlugin(req: Request, res: Response) {
  const upload = (req as any).file as UploadedPlugin | undefined;
  const filename =
    upload?.originalname ??
    String(req.body?.filename ?? req.query?.filename ?? "plugin.zip");

  const body = upload?.buffer
    ? upload.buffer
    : Buffer.from(String(req.body?.contents ?? ""), "base64");

  await fs.mkdir(pluginsDir, { recursive: true });
  await fs.writeFile(path.join(pluginsDir, filename), body);

  res.json({ ok: true, storedAs: filename });
}
