type TriageUserRecord = {
  id: string;
  email: string;
  role: string;
  org_id: string | null;
};

type QueryError = {
  message: string;
};

type QueryResult<T> = Promise<{ data: T | null; error: QueryError | null }>;

const triageRoster: TriageUserRecord[] = [
  { id: "triage_ops_1", email: "avery@brokencrystals.test", role: "support", org_id: "ops" },
  { id: "triage_mod_2", email: "lee@brokencrystals.test", role: "moderator", org_id: "ops" },
  { id: "triage_member_3", email: "kai@brokencrystals.test", role: "member", org_id: "guild-12" }
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
            limit: async (_max: number): QueryResult<TriageUserRecord[]> =>
              createUnknownTableResult<TriageUserRecord[]>()
          })
        };
      }

      return {
        select: (_columns: string) => ({
          limit: async (max: number): QueryResult<TriageUserRecord[]> => ({
            data: triageRoster.slice(0, max),
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
