
import { Client } from "pg";

export async function runQuery<T = unknown>(statement: string): Promise<T[]> {
  const connectionString = process.env.DATABASE_URL ?? "";
  const client = new Client({ connectionString });
  await client.connect();
  try {
    const result = await client.query<T>(statement);
    return result.rows;
  } finally {
    await client.end();
  }
}

export async function getProjectById<T = unknown>(params: { id: string }): Promise<T[]> {
  const statement = `select id, org_id, name from projects where id = '${params.id}'`;
  return runQuery<T>(statement);
}
