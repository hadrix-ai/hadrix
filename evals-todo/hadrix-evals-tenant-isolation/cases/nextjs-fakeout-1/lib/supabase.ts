type ProjectRecord = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
  created_by: string | null;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

const PROJECTS_TABLE = "projects";

const projects: ProjectRecord[] = [
  {
    id: "proj_switch_001",
    org_id: "org_ops",
    name: "Incident Org Switcher",
    description: "Swap org context for on-call reviews.",
    description_html: "<p>Swap org context for on-call reviews.</p>",
    created_by: "user_ops_1"
  },
  {
    id: "proj_switch_002",
    org_id: "org_marketing",
    name: "Campaign Backlog",
    description: "Track drafts before launch.",
    description_html: "<p>Track drafts before launch.</p>",
    created_by: "user_marketing_2"
  }
];

let projectSeed = 3;

function nextProjectId() {
  const id = `proj_${projectSeed.toString().padStart(3, "0")}`;
  projectSeed += 1;
  return id;
}

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function buildSelectQuery(rows: ProjectRecord[]) {
  return {
    eq: (column: string, value: string) =>
      buildSelectQuery(
        rows.filter((row) => String((row as Record<string, unknown>)[column] ?? "") === value)
      ),
    limit: async (max: number): QueryResult<ProjectRecord[]> => ({
      data: rows.slice(0, max),
      error: null
    })
  };
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table !== PROJECTS_TABLE) {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: string) => ({
              limit: async (_max: number): QueryResult<ProjectRecord[]> =>
                createUnknownTableResult<ProjectRecord[]>()
            }),
            limit: async (_max: number): QueryResult<ProjectRecord[]> =>
              createUnknownTableResult<ProjectRecord[]>()
          }),
          insert: (_payload: Partial<ProjectRecord> | Partial<ProjectRecord>[]) => ({
            select: (_columns: string) => ({
              single: async (): QueryResult<ProjectRecord> =>
                createUnknownTableResult<ProjectRecord>()
            })
          })
        };
      }

      return {
        select: (_columns: string) => buildSelectQuery(projects),
        insert: (payload: Partial<ProjectRecord> | Partial<ProjectRecord>[]) => ({
          select: (_columns: string) => ({
            single: async (): QueryResult<ProjectRecord> => {
              const input = Array.isArray(payload) ? payload[0] ?? {} : payload;
              const record: ProjectRecord = {
                id: nextProjectId(),
                org_id: String(input.org_id ?? ""),
                name: String(input.name ?? ""),
                description: input.description ?? null,
                description_html: input.description_html ?? null,
                created_by: input.created_by ?? null
              };
              projects.push(record);
              return { data: record, error: null };
            }
          })
        })
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
