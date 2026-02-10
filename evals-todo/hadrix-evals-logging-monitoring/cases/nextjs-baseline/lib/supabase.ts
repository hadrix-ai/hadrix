type ProjectRecord = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  description_html: string | null;
  created_by: string | null;
};

type ApiTokenRecord = {
  id: string;
  user_id: string;
  token_plaintext: string | null;
};

type UserRecord = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

const projectStore: ProjectRecord[] = [
  {
    id: "proj_ops_1",
    org_id: "ops",
    name: "Launchpad Ops",
    description: "On-call launchpad tracking",
    description_html: "<p>On-call launchpad tracking</p>",
    created_by: "user_ops_1"
  }
];

const apiTokenStore: ApiTokenRecord[] = [];

const userStore: UserRecord[] = [
  { id: "user_ops_1", email: "aria@brokencrystals.test", role: "admin", org_id: "ops" },
  { id: "user_ops_2", email: "devon@brokencrystals.test", role: "admin", org_id: "ops" },
  { id: "user_member_3", email: "jay@brokencrystals.test", role: "member", org_id: "guild-44" }
];

let projectIndex = 2;
let apiTokenIndex = 1;

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table === "projects") {
        return {
          select: (_columns: string) => ({
            eq: (_column: string, value: string) => ({
              limit: async (max: number): QueryResult<ProjectRecord[]> => ({
                data: projectStore.filter((project) => project.org_id === value).slice(0, max),
                error: null
              })
            })
          }),
          insert: (record: Partial<ProjectRecord>) => ({
            select: (_columns: string) => ({
              single: async (): QueryResult<Pick<ProjectRecord, "id" | "org_id" | "name">> => {
                const nextRecord: ProjectRecord = {
                  id: `proj_ops_${projectIndex++}`,
                  org_id: String(record.org_id ?? "ops"),
                  name: String(record.name ?? "Untitled"),
                  description: record.description ?? null,
                  description_html: record.description_html ?? null,
                  created_by: record.created_by ?? null
                };

                projectStore.push(nextRecord);

                return {
                  data: { id: nextRecord.id, org_id: nextRecord.org_id, name: nextRecord.name },
                  error: null
                };
              }
            })
          })
        };
      }

      if (table === "api_tokens") {
        return {
          insert: async (record: Partial<ApiTokenRecord>): QueryResult<null> => {
            apiTokenStore.push({
              id: `token_row_${apiTokenIndex++}`,
              user_id: String(record.user_id ?? "unknown"),
              token_plaintext: record.token_plaintext ?? null
            });
            return { data: null, error: null };
          }
        };
      }

      if (table === "users") {
        return {
          delete: () => ({
            eq: async (_column: string, value: string): QueryResult<null> => {
              const index = userStore.findIndex((user) => user.id === value);
              if (index >= 0) {
                userStore.splice(index, 1);
              }
              return { data: null, error: null };
            }
          })
        };
      }

      return {
        select: (_columns: string) => ({
          eq: (_column: string, _value: string) => ({
            limit: async (_max: number): QueryResult<unknown[]> =>
              createUnknownTableResult<unknown[]>()
          })
        }),
        insert: async (_record: unknown): QueryResult<null> => createUnknownTableResult<null>(),
        delete: () => ({
          eq: async (_column: string, _value: string): QueryResult<null> =>
            createUnknownTableResult<null>()
        })
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
