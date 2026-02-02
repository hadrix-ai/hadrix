import type { Request, Response } from "express";

const db = {
  async query(_sql: string) {
    return [] as Array<Record<string, unknown>>;
  },
};

export async function listTenantOrders(req: Request, res: Response) {
  const orgId = String(req.body?.orgId ?? "");
  const rows = await db.query(
    `select * from orders where org_id = '${orgId}' order by created_at desc`
  );
  res.json({ orders: rows });
}
