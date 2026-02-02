
export async function unsafeSql<T = unknown>(sql: string): Promise<T[]> {
  console.log("Executing SQL:", sql);
  return [];
}
