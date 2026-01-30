
import { Client } from "pg";

export async function unsafeSql<T = unknown>(sql: string): Promise<T[]> {
  const connectionString = process.env.DATABASE_URL ?? "";
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<T>(sql);
    return result.rows;
  } finally {
    await client.end();
  }
}

export async function getProjectById<T = unknown>(params: { id: string }): Promise<T[]> {
  const sql = `select id, org_id, name from projects where id = '${params.id}'`;
  return unsafeSql<T>(sql);
}
