type Row = Record<string, unknown>;
type TableName = "org_members" | "projects";

const tables: Record<TableName, Row[]> = {
  org_members: [
    { org_id: "org-release", user_id: "user-desk-admin" },
    { org_id: "org-release", user_id: "user-desk-07" },
    { org_id: "org-playground", user_id: "user-desk-admin" }
  ],
  projects: [
    { id: "proj-release-ops", org_id: "org-release", name: "Release Ops Console", created_at: "2024-11-19T08:12:00Z" },
    { id: "proj-deploy-tracker", org_id: "org-release", name: "Deploy Tracker", created_at: "2024-10-03T14:41:00Z" },
    { id: "proj-sandbox", org_id: "org-playground", name: "Sandbox Sync", created_at: "2024-09-01T10:15:00Z" }
  ]
};

type OrderConfig = { ascending?: boolean };
type Filter = (row: Row) => boolean;

function parseColumns(columns: string | undefined): string[] | null {
  if (!columns || columns.trim() === "*") return null;
  return columns
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function pickColumns(row: Row, columns: string[]): Row {
  const picked: Row = {};
  for (const column of columns) {
    picked[column] = row[column];
  }
  return picked;
}

function createQuery(rows: Row[]) {
  let selectedColumns: string[] | null = null;
  let filters: Filter[] = [];
  let orderBy: { column: string; ascending: boolean } | null = null;
  let limitCount: number | null = null;

  const builder = {
    select(columns: string) {
      selectedColumns = parseColumns(columns);
      return builder;
    },
    eq(column: string, value: unknown) {
      filters = [...filters, (row) => row[column] === value];
      return builder;
    },
    in(column: string, values: unknown[]) {
      const allowed = new Set(values);
      filters = [...filters, (row) => allowed.has(row[column])];
      return builder;
    },
    order(column: string, options: OrderConfig = {}) {
      orderBy = { column, ascending: options.ascending !== false };
      return builder;
    },
    limit(count: number) {
      limitCount = count;
      return builder;
    },
    async execute() {
      let data = [...rows];

      for (const filter of filters) {
        data = data.filter(filter);
      }

      if (orderBy) {
        const direction = orderBy.ascending ? 1 : -1;
        data.sort((a, b) => {
          const left = a[orderBy!.column];
          const right = b[orderBy!.column];
          const bothNumbers = typeof left === "number" && typeof right === "number";
          const leftValue = bothNumbers ? left : String(left ?? "");
          const rightValue = bothNumbers ? right : String(right ?? "");
          if (leftValue === rightValue) return 0;
          if (left === undefined) return 1 * direction;
          if (right === undefined) return -1 * direction;
          return leftValue > rightValue ? 1 * direction : -1 * direction;
        });
      }

      if (limitCount !== null) {
        data = data.slice(0, limitCount);
      }

      if (selectedColumns) {
        data = data.map((row) => pickColumns(row, selectedColumns));
      }

      return { data, error: null };
    },
    then<TResult1 = { data: Row[]; error: null }, TResult2 = never>(
      onfulfilled?: ((value: { data: Row[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return builder.execute().then(onfulfilled, onrejected);
    }
  };

  return builder;
}

export function supabaseAdmin() {
  return {
    from(table: TableName) {
      const rows = tables[table] ?? [];
      return createQuery(rows);
    }
  };
}
