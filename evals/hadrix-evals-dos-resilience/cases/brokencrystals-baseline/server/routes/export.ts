import type { Request, Response } from "express";

const db = {
  async query(_sql: string) {
    return [] as Array<Record<string, unknown>>;
  },
};

export async function exportOrders(req: Request, res: Response) {
  const orgId = String(req.query.orgId ?? "");
  const rows = await db.query(`select * from orders where org_id = '${orgId}'`);
  res.json({ orders: rows });
}
