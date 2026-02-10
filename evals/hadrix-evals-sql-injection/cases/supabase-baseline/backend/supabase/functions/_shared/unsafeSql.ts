// Raw SQL helper used to demonstrate injection-style flaws in Edge Functions.
// This is intentionally unsafe and exists for scanner evaluation fixtures.

type QueryResult<T> = {
  rows: T[];
};

const FIXTURE_ROWS = [
  {
    id: "proj_ops_1",
    org_id: "org-1",
    name: "Portfolio Radar",
    description: "Ops snapshot feed for portfolio triage.",
    description_html: "<p>Ops snapshot feed for portfolio triage.</p>"
  }
];

const inMemoryClient = {
  async queryObject<T>(sql: string): Promise<QueryResult<T>> {
    console.log("Executing SQL:", sql);
    return { rows: FIXTURE_ROWS as T[] };
  }
};

export async function unsafeSql<T = unknown>(sql: string): Promise<T[]> {
  const res = await inMemoryClient.queryObject<T>(sql);
  return res.rows;
}
