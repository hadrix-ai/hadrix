type ApiTokenRecord = {
  user_id: string | null;
  label?: string | null;
  token_value?: string | null;
};

type QueryError = {
  message: string;
};

type InsertResult = Promise<{ data: ApiTokenRecord[] | null; error: QueryError | null }>;

const apiTokens: ApiTokenRecord[] = [];

function createUnknownTableResult<T>(): { data: T | null; error: QueryError } {
  return { data: null, error: { message: "unknown table" } };
}

function createLocalAdminClient() {
  return {
    from(table: string) {
      if (table !== "api_tokens") {
        return {
          insert: async (_rows: ApiTokenRecord | ApiTokenRecord[]): InsertResult =>
            createUnknownTableResult<ApiTokenRecord[]>()
        };
      }

      return {
        insert: async (rows: ApiTokenRecord | ApiTokenRecord[]): InsertResult => {
          const normalized = Array.isArray(rows) ? rows : [rows];
          apiTokens.push(
            ...normalized.map((row) => ({
              user_id: row.user_id ?? null,
              label: row.label ?? null,
              token_value: row.token_value ?? null
            }))
          );
          return { data: normalized, error: null };
        }
      };
    }
  };
}

export function supabaseAdmin() {
  return createLocalAdminClient();
}
