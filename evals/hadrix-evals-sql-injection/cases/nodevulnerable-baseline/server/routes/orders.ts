import type { Request, Response } from "express";
import { unsafeSql } from "../db/unsafeSql";

type OrderRow = {
  id: string;
  user_id: string;
  total: number;
};

export async function listOrders(req: Request, res: Response) {
  const userId = String(req.query.userId ?? "");

  if (!userId) {
    res.status(400).json({ error: "missing userId" });
    return;
  }

  const sql =
    `select id, user_id, total from orders where user_id = '${userId}' order by created_at desc`;
  const rows = await unsafeSql<OrderRow>(sql);
  res.json({ orders: rows });
}
