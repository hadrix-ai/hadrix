type ProjectRecord = {
  id: string;
  org_id: string | null;
  name: string;
  description: string | null;
  description_html: string | null;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

const projectRoster: ProjectRecord[] = [
  {
    id: "proj-401",
    org_id: "org-shell",
    name: "Pulse Tracker",
    description: "Weekly sentiment rollups for the ops queue.",
    description_html: "<p>Weekly sentiment rollups for the ops queue.</p>"
  },
  {
    id: "proj-402",
    org_id: "org-vapor",
    name: "Vapor Brief",
    description: "Auto-compiled incident recaps for project leads.",
    description_html: "<p>Auto-compiled incident recaps for project leads.</p>"
  }
];

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table !== "projects") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: string) => ({
              maybeSingle: async (): QueryResult<ProjectRecord> =>
                createUnknownTableResult<ProjectRecord>()
            })
          })
        };
      }

      return {
        select: (_columns: string) => ({
          eq: (_column: string, value: string) => ({
            maybeSingle: async (): QueryResult<ProjectRecord> => ({
              data: projectRoster.find((row) => row.id === value) ?? null,
              error: null
            })
          })
        })
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
