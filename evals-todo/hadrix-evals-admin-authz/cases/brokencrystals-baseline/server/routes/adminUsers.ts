import type { Request, Response } from "express";

const db = {
  async query(_sql: string) {
    return [];
  },
};

export async function grantAdmin(req: Request, res: Response) {
  const userId = String(req.params.id ?? "");
  const isAdmin = Boolean(req.body?.isAdmin);
  await db.query(`update users set is_admin = ${isAdmin} where id = '${userId}'`);
  res.json({ ok: true });
}
