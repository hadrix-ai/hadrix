type SupportUserRecord = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

const supportRoster: SupportUserRecord[] = [
  { id: "user_ops_1", email: "aria@brokencrystals.test", role: "support", org_id: "ops" },
  { id: "user_mod_2", email: "devon@brokencrystals.test", role: "moderator", org_id: "ops" },
  { id: "user_member_3", email: "jay@brokencrystals.test", role: "member", org_id: "guild-44" }
];

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table !== "users") {
        return {
          select: (_columns: string) => ({
            limit: async (_max: number): QueryResult<SupportUserRecord[]> =>
              createUnknownTableResult<SupportUserRecord[]>()
          }),
          delete: () => ({
            eq: async (_column: string, _value: string): QueryResult<null> =>
              createUnknownTableResult<null>()
          })
        };
      }

      return {
        select: (_columns: string) => ({
          limit: async (max: number): QueryResult<SupportUserRecord[]> => ({
            data: supportRoster.slice(0, max),
            error: null
          })
        }),
        delete: () => ({
          eq: async (_column: string, value: string): QueryResult<null> => {
            const index = supportRoster.findIndex((row) => row.id === value);
            if (index >= 0) {
              supportRoster.splice(index, 1);
            }
            return { data: null, error: null };
          }
        })
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
