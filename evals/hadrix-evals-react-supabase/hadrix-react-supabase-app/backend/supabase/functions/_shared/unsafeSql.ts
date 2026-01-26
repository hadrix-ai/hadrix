// Raw SQL helper used to demonstrate injection-style flaws in Edge Functions.
// This is intentionally unsafe and exists for scanner evaluation fixtures.

import { Client } from "https://deno.land/x/postgres@v0.17.0/mod.ts";

export async function unsafeSql<T = unknown>(sql: string): Promise<T[]> {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL") ?? Deno.env.get("DATABASE_URL") ?? "";
  const client = new Client(dbUrl);
  await client.connect();
  try {
    const res = await client.queryObject<T>(sql);
    return res.rows;
  } finally {
    await client.end();
  }
}

