type QueryError = { message: string };

type ProjectRow = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

const TABLE_PROJECTS = "projects" as const;

const PROJECT_ROSTER: ProjectRow[] = [
  {
    id: "proj-701",
    org_id: "org-aurora",
    name: "Pulse Atlas",
    description: "Support dashboard rollups for incident retros.",
    description_html: "<p>Support dashboard rollups for incident retros.</p>"
  },
  {
    id: "proj-702",
    org_id: "org-drift",
    name: "Queue Compass",
    description: "Ticket routing helpers for the Trust Desk queue.",
    description_html: "<p>Ticket routing helpers for the Trust Desk queue.</p>"
  }
];

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table !== TABLE_PROJECTS) {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, _value: string) => ({
              maybeSingle: async (): QueryResult<ProjectRow> =>
                createUnknownTableResult<ProjectRow>()
            })
          })
        };
      }

      return {
        select: (_columns: string) => ({
          eq: (_column: string, value: string) => ({
            maybeSingle: async (): QueryResult<ProjectRow> => ({
              data: PROJECT_ROSTER.find((row) => row.id === value) ?? null,
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
