type AdminUserRecord = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

type ProjectRecord = {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  description_html: string | null;
  created_by: string | null;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

const adminRoster: AdminUserRecord[] = [
  { id: "ops_1", email: "sloane@reliability.test", role: "support", org_id: "ops" },
  { id: "ops_2", email: "juno@reliability.test", role: "moderator", org_id: "ops" },
  { id: "member_7", email: "kai@brokencrystals.test", role: "member", org_id: "guild-44" }
];

const projects: ProjectRecord[] = [
  {
    id: "proj_1",
    org_id: "ops",
    name: "Incident Atlas",
    description: "Shared incident tags, runbooks, and hotfix notes.",
    description_html: "<p>Shared incident tags, runbooks, and hotfix notes.</p>",
    created_by: "ops_1"
  },
  {
    id: "proj_2",
    org_id: "guild-44",
    name: "Shard Watch",
    description: "Region-level health checks for embedded shards.",
    description_html: "<p>Region-level health checks for embedded shards.</p>",
    created_by: "member_7"
  }
];

let projectSequence = projects.length + 1;

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function createUnknownSelectQuery<T>() {
  const result = createUnknownTableResult<T[]>();
  return {
    eq: (_column: string, _value: string) => createUnknownSelectQuery<T>(),
    limit: async (_max: number): QueryResult<T[]> => result,
    then: (onfulfilled?: any, onrejected?: any) => Promise.resolve(result).then(onfulfilled, onrejected)
  };
}

function createSelectQuery<T extends Record<string, any>>(rows: T[]) {
  const result = { data: rows, error: null as QueryError | null };
  return {
    eq: (column: string, value: string) =>
      createSelectQuery(rows.filter((row) => row[column] === value)),
    limit: async (max: number): QueryResult<T[]> => ({
      data: rows.slice(0, max),
      error: null
    }),
    then: (onfulfilled?: any, onrejected?: any) => Promise.resolve(result).then(onfulfilled, onrejected)
  };
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table === "users") {
        return {
          select: (_columns: string) => createSelectQuery(adminRoster)
        };
      }

      if (table === "projects") {
        return {
          select: (_columns: string) => createSelectQuery(projects),
          insert: (rows: Partial<ProjectRecord> | Partial<ProjectRecord>[]) => {
            const normalized = Array.isArray(rows) ? rows : [rows];
            const created = normalized.map((row) => {
              const project: ProjectRecord = {
                id: `proj_${projectSequence}`,
                org_id: row.org_id ?? null,
                name: row.name ?? "untitled",
                description: row.description ?? null,
                description_html: row.description_html ?? null,
                created_by: row.created_by ?? null
              };
              projectSequence += 1;
              projects.push(project);
              return project;
            });
            const first = created[0] ?? null;
            return {
              select: (_columns: string) => ({
                single: async (): QueryResult<ProjectRecord> => ({ data: first, error: null })
              })
            };
          }
        };
      }

      return {
        select: (_columns: string) => createUnknownSelectQuery(),
        insert: (_rows: unknown) => ({
          select: (_columns: string) => ({
            single: async () => createUnknownTableResult<null>()
          })
        })
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
