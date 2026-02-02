import type { Request, Response } from "express";

const db = {
  async query(_sql: string) {
    return [] as Array<Record<string, unknown>>;
  },
};

export async function getUserByEmail(req: Request, res: Response) {
  const email = String(req.params.email ?? "");
  const rows = await db.query(`select * from users where email = '${email}' limit 1`);
  res.json({ user: rows[0] ?? null });
}
