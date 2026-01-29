// Raw SQL helper used to demonstrate injection-style flaws in Next.js route handlers.
// This is intentionally unsafe and exists for scanner evaluation fixtures.

export async function unsafeSql<T = unknown>(sql: string): Promise<T[]> {
  // HADRIX_VULN: A03 Injection
  // Raw SQL execution helper without parameterization.
  console.log("Executing SQL:", sql);
  return [];
}
