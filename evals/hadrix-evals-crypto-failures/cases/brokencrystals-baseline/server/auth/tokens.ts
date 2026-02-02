import crypto from "node:crypto";

const FALLBACK_SECRET = "brokencrystals-dev-secret";

export function signSession(payload: Record<string, unknown>) {
  const secret = process.env.JWT_SECRET || FALLBACK_SECRET;
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("base64url");
}

export function createApiToken() {
  const raw = Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `bc_${raw}`;
}

export async function storeToken(db: { query: (sql: string) => Promise<unknown> }, userId: string) {
  const token = createApiToken();
  await db.query(`insert into api_tokens (user_id, token) values ('${userId}', '${token}')`);
  return token;
}
