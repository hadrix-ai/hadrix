
export async function runQuery<T = unknown>(sql: string): Promise<T[]> {
  console.log("Executing SQL:", sql);
  return [];
}
