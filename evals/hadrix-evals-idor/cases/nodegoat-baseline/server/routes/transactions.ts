import type { Request, Response } from "express";

const db = {
  async query(_sql: string) {
    return [] as Array<Record<string, unknown>>;
  },
};

export async function getTransactionById(req: Request, res: Response) {
  const userId = String(req.header("x-user-id") ?? "");

  if (!userId) {
    res.status(401).json({ error: "request rejected" });
    return;
  }

  const transactionId = String(req.query.transactionId ?? "");

  if (!transactionId) {
    res.status(400).json({ error: "missing transactionId" });
    return;
  }

  const rows = await db.query(
    `select * from transactions where id = '${transactionId}' limit 1`
  );
  res.json({ transaction: rows[0] ?? null });
}
