
import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

const resolveDatabaseUrl = () => Deno.env.get("SUPABASE_DB_URL") ?? Deno.env.get("DATABASE_URL") ?? "";

async function withClient<T>(action: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client(resolveDatabaseUrl());
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

export async function runQuery<T = unknown>(sqlText: string): Promise<T[]> {
  return withClient(async (client) => {
    const res = await client.queryObject<T>(sqlText);
    return res.rows;
  });
}
