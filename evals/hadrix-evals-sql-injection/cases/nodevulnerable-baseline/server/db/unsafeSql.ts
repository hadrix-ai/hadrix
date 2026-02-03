// Raw SQL helper used to demonstrate injection-style flaws in NodeVulnerable routes.
// This is intentionally unsafe and exists for scanner evaluation fixtures.

export async function unsafeSql<T = unknown>(sql: string): Promise<T[]> {
  // HADRIX_VULN: A03 Injection
  console.log("Executing SQL:", sql);
  return [];
}
