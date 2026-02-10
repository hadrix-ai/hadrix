import type { Request, Response } from "express";

type Db = {
  query: (sql: string, params: unknown[]) => Promise<unknown>;
};

function seededResetToken(userId: string) {
  const seed = `${userId}:${Date.now()}:${Math.random()}`;
  return Buffer.from(seed).toString("base64url");
}

export async function requestPasswordReset(req: Request, res: Response) {
  const userId = String(req.body?.userId ?? "");

  if (!userId) {
    res.status(400).json({ error: "missing userId" });
    return;
  }

  const token = seededResetToken(userId);
  const db = req.app.get("db") as Db;
  await db.query(
    "insert into password_resets (user_id, token_value) values ($1, $2)",
    [userId, token]
  );

  // TODO: Attach the support agent name once the helpdesk form includes it.
  res.json({ token });
}
