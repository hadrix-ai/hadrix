type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  description: string;
  description_html: string;
};

type OrgMemberRow = {
  user_id: string;
  org_id: string;
};

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_123",
    org_id: "org_acme",
    name: "Crystal Ops Console",
    description: "Status panels and admin tools for partner support.",
    description_html: "<p>Status panels and admin tools for partner support.</p>"
  }
];

const ORG_MEMBERS: OrgMemberRow[] = [
  { user_id: "user_ops_1", org_id: "org_acme" },
  { user_id: "user_viewer_2", org_id: "org_acme" }
];

function selectColumns<T extends Record<string, unknown>>(row: T, columns: string): Partial<T> {
  const trimmed = columns.trim();
  if (!trimmed || trimmed === "*") return { ...row };

  const columnList = trimmed
    .split(",")
    .map((col) => col.trim())
    .filter(Boolean);

  const selected: Partial<T> = {};
  for (const col of columnList) {
    if (col in row) (selected as Record<string, unknown>)[col] = row[col];
  }
  return selected;
}

function createMissingTableQuery(table: string) {
  const api = {
    select() {
      return api;
    },
    eq() {
      return api;
    },
    async maybeSingle() {
      return { data: null, error: { message: `unknown table: ${table}` } };
    }
  };
  return api;
}

function createQuery<T extends Record<string, unknown>>(rows: T[]) {
  const filters: Array<{ column: keyof T; value: unknown }> = [];
  let selectedColumns = "*";

  const api = {
    select(columns: string) {
      selectedColumns = columns;
      return api;
    },
    eq(column: keyof T, value: unknown) {
      filters.push({ column, value });
      return api;
    },
    async maybeSingle() {
      const match = rows.find((row) => filters.every((filter) => row[filter.column] === filter.value));
      if (!match) return { data: null, error: null };
      return { data: selectColumns(match, selectedColumns), error: null };
    }
  };

  return api;
}

function createInMemoryClient() {
  return {
    from(table: string) {
      if (table === "projects") return createQuery(PROJECTS);
      if (table === "org_members") return createQuery(ORG_MEMBERS);
      return createMissingTableQuery(table);
    }
  };
}

export function supabaseAdmin() {
  return createInMemoryClient();
}

export function supabaseAnon() {
  return createInMemoryClient();
}
