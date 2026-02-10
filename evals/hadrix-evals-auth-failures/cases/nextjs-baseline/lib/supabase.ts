type LaunchpadUserRecord = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

const launchpadRoster: LaunchpadUserRecord[] = [
  { id: "user_launch_1", email: "mara@launchpad.test", role: "member", org_id: "lp-core" },
  { id: "user_launch_2", email: "nick@launchpad.test", role: "admin", org_id: "lp-core" },
  { id: "user_launch_3", email: "sasha@launchpad.test", role: "member", org_id: "lp-north" }
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
            limit: async (_max: number): QueryResult<LaunchpadUserRecord[]> =>
              createUnknownTableResult<LaunchpadUserRecord[]>()
          })
        };
      }

      return {
        select: (_columns: string) => ({
          limit: async (max: number): QueryResult<LaunchpadUserRecord[]> => ({
            data: launchpadRoster.slice(0, max),
            error: null
          })
        })
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
