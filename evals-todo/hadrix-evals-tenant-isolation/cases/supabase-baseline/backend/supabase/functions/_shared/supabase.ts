type QueryError = { message: string };

type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
  created_by: string;
  created_at: string;
};

type InMemoryStore = {
  projects: ProjectRow[];
};

const TABLE_PROJECTS = "projects" as const;

const SEED_TIMESTAMP = "2024-04-22T09:00:00.000Z";

const SEED_PROJECTS: ProjectRow[] = [
  {
    id: "proj-1001",
    org_id: "org-crystal",
    name: "Crystal Sync",
    description: "Backfill the spring launch backlog.",
    description_html: "<p>Backfill the spring launch backlog.</p>",
    created_by: "user-2001",
    created_at: "2024-04-20T16:45:00.000Z"
  },
  {
    id: "proj-1002",
    org_id: "org-lighthouse",
    name: "Lighthouse QA",
    description: "Bug bash planning for release week.",
    description_html: "<p>Bug bash planning for release week.</p>",
    created_by: "user-2002",
    created_at: "2024-04-21T08:30:00.000Z"
  }
];

function createStore(): InMemoryStore {
  return {
    projects: SEED_PROJECTS.map((project) => ({ ...project }))
  };
}

function parseColumns(columnList?: string): string[] | null {
  if (!columnList) return null;
  const columns = columnList
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
  return columns.length ? columns : null;
}

function projectRow<T extends Record<string, unknown>>(row: T, columns: string[] | null): Partial<T> {
  if (!columns) {
    return { ...row };
  }

  const projected: Partial<T> = {};
  for (const column of columns) {
    if (column in row) {
      projected[column as keyof T] = row[column as keyof T];
    }
  }
  return projected;
}

function projectRows<T extends Record<string, unknown>>(rows: T[], columns: string[] | null): Partial<T>[] {
  return rows.map((row) => projectRow(row, columns));
}

function applyFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: Array<{ column: string; value: unknown }>
): T[] {
  if (!filters.length) return rows;
  return rows.filter((row) =>
    filters.every((filter) => String(row[filter.column] ?? "") === String(filter.value ?? ""))
  );
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  return String(a ?? "").localeCompare(String(b ?? ""));
}

function applyOrder<T extends Record<string, unknown>>(
  rows: T[],
  orderBy: { column: string; ascending: boolean } | null
): T[] {
  if (!orderBy) return rows;
  const { column, ascending } = orderBy;
  const sorted = [...rows].sort((left, right) => {
    const delta = compareValues(left[column], right[column]);
    return ascending ? delta : -delta;
  });
  return sorted;
}

class InsertBuilder<T extends Record<string, unknown>> {
  private columns: string[] | null = null;

  constructor(private rows: T[]) {}

  select(columns: string) {
    this.columns = parseColumns(columns);
    return this;
  }

  async single(): Promise<{ data: Partial<T> | null; error: QueryError | null }> {
    const row = this.rows[0] ?? null;
    return { data: row ? projectRow(row, this.columns) : null, error: null };
  }
}

class InMemoryQuery<T extends Record<string, unknown>> {
  private columns: string[] | null = null;
  private filters: Array<{ column: string; value: unknown }> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;

  constructor(private rows: T[], private normalize?: (row: T, index: number) => T) {}

  select(columns: string) {
    this.columns = parseColumns(columns);
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  async limit(count: number): Promise<{ data: Partial<T>[]; error: QueryError | null }> {
    const filtered = applyFilters(this.rows, this.filters);
    const ordered = applyOrder(filtered, this.orderBy);
    const limited = ordered.slice(0, Math.max(0, count));
    return { data: projectRows(limited, this.columns), error: null };
  }

  insert(payload: T | T[]) {
    const inputRows = Array.isArray(payload) ? payload : [payload];
    const startIndex = this.rows.length;
    const storedRows = inputRows.map((row, index) =>
      this.normalize ? this.normalize(row, startIndex + index) : { ...row }
    );
    this.rows.push(...storedRows);
    return new InsertBuilder(storedRows);
  }
}

export function supabaseAdmin() {
  const store = createStore();
  return {
    from(table: string) {
      if (table === TABLE_PROJECTS) {
        return new InMemoryQuery<ProjectRow>(store.projects, (row, index) => ({
          ...row,
          id: row.id ?? `proj_${index + 1}`,
          created_at: row.created_at ?? SEED_TIMESTAMP,
          description: row.description ?? null,
          description_html: row.description_html ?? null
        }));
      }
      return new InMemoryQuery<Record<string, unknown>>([]);
    }
  };
}

export function supabaseAnon() {
  return supabaseAdmin();
}
