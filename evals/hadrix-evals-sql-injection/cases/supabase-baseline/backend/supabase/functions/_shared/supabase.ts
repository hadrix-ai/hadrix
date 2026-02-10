type OrgMemberRow = {
  user_id: string;
  org_id: string;
};

type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  created_at: string;
};

const ORG_MEMBERS: OrgMemberRow[] = [{ user_id: "user_ops_1", org_id: "org-1" }];
const PROJECTS: ProjectRow[] = [
  { id: "proj_ops_1", org_id: "org-1", name: "Portfolio Radar", created_at: "2024-10-01T08:00:00Z" },
  { id: "proj_ops_2", org_id: "org-1", name: "Signal Harvest", created_at: "2024-09-12T14:30:00Z" }
];

type TableName = "org_members" | "projects";

type QueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
};

class SupabaseQuery<T extends Record<string, unknown>> implements PromiseLike<QueryResult<T>> {
  private rows: T[];

  constructor(rows: T[]) {
    this.rows = rows;
  }

  select(_columns?: string) {
    return this;
  }

  eq(column: keyof T & string, value: unknown) {
    this.rows = this.rows.filter((row) => row[column] === value);
    return this;
  }

  in(column: keyof T & string, values: unknown[]) {
    if (values.length === 0) {
      this.rows = [];
      return this;
    }
    this.rows = this.rows.filter((row) => values.includes(row[column]));
    return this;
  }

  order(_column: keyof T & string, _opts?: { ascending?: boolean }) {
    return this;
  }

  or(_filter: string) {
    return this;
  }

  async maybeSingle() {
    return { data: this.rows[0] ?? null, error: null };
  }

  async limit(limit: number) {
    return { data: this.rows.slice(0, limit), error: null };
  }

  then<TResult1 = QueryResult<T>, TResult2 = never>(
    onfulfilled?: (value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>,
    onrejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve({ data: this.rows, error: null }).then(onfulfilled, onrejected);
  }
}

class SupabaseAdminStub {
  from<T extends TableName>(table: T): SupabaseQuery<(T extends "org_members" ? OrgMemberRow : ProjectRow)> {
    if (table === "org_members") {
      return new SupabaseQuery([...ORG_MEMBERS]) as SupabaseQuery<any>;
    }
    if (table === "projects") {
      return new SupabaseQuery([...PROJECTS]) as SupabaseQuery<any>;
    }
    return new SupabaseQuery([]) as SupabaseQuery<any>;
  }
}

export function supabaseAdmin() {
  return new SupabaseAdminStub();
}
