import type { Request, Response } from "express";

const db = {
  async query(_sql: string) {
    return [] as Array<Record<string, unknown>>;
  },
};

export async function getAccountById(req: Request, res: Response) {
  const userId = String(req.header("x-user-id") ?? "");

  if (!userId) {
    res.status(401).json({ error: "request rejected" });
    return;
  }

  const accountId = String(req.params.accountId ?? "");

  if (!accountId) {
    res.status(400).json({ error: "missing accountId" });
    return;
  }

  const rows = await db.query(`select * from accounts where id = '${accountId}' limit 1`);
  res.json({ account: rows[0] ?? null });
}
