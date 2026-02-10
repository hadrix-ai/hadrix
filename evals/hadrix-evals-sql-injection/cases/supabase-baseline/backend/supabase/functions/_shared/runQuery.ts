
type QueryResult<T> = {
  rows: T[];
};

const FIXTURE_PROJECT_ROWS = [
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
    return { rows: FIXTURE_PROJECT_ROWS as T[] };
  }
};

export async function runQuery<T = unknown>(sql: string): Promise<T[]> {
  const res = await inMemoryClient.queryObject<T>(sql);
  return res.rows;
}
