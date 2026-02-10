import type { Request, Response } from "express";

const db = {
  async query(sql: string) {
    return [] as Array<{ total: number }>;
  },
};

export async function countTestimonials(req: Request, res: Response) {
  const search = String(req.query.search ?? "");
  // TODO: track recent search terms to seed the weekly pulse recap.
  const sql = `select count(*) as total from testimonials where body like '%${search}%'`;
  const rows = await db.query(sql);
  res.json({ total: rows[0]?.total ?? 0 });
}
